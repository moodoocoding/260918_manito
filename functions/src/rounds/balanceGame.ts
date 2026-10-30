import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { warn } from "firebase-functions/logger";
import { db } from "../shared/firebase.js";
import { assertStudentTransaction, requireActiveStudent } from "../shared/student.js";
import { requireRecord } from "../shared/validation.js";

const geminiApiKey = defineSecret("GEMINI_API_KEY");
const gameDocId = "current";
const questionSet = [
  { id: "q1", a: "고양이", b: "강아지" },
  { id: "q2", a: "후라이드 치킨", b: "양념 치킨" },
  { id: "q3", a: "짬뽕", b: "짜장면" },
  { id: "q4", a: "민트초코 좋아", b: "민트초코 싫어" },
  { id: "q5", a: "탕수육 찍먹", b: "탕수육 부먹" },
  { id: "q6", a: "6교시 내내 음악", b: "6교시 내내 미술" },
  { id: "q7", a: "쉬는 시간에 책 읽기", b: "쉬는 시간에 그림 그리기" },
  { id: "q8", a: "비 오는 날 실내 놀이", b: "맑은 날 운동장 놀이" },
  { id: "q9", a: "수학 퀴즈 풀기", b: "새로운 낱말 배우기" },
  { id: "q10", a: "소풍에서 보물찾기", b: "소풍에서 자연 관찰" },
] as const;
type Choice = "A" | "B";
type Pair = { a: string; b: string; score: number };

class BalanceProviderError extends Error {
  constructor(readonly httpStatus: number, readonly reason: string) {
    super(`Gemini returned ${httpStatus}`);
  }
}

class BalanceOutputError extends Error {
  constructor(readonly reason: string) { super("Gemini response cannot be used"); }
}

class BalanceConfigurationError extends Error {
  constructor(readonly reason: "MISSING_API_KEY" | "INVALID_API_KEY_FORMAT") {
    super(reason === "MISSING_API_KEY" ? "GEMINI_API_KEY is not configured" : "GEMINI_API_KEY format is invalid");
  }
}

export function balanceMatchingFailureDetails(error: unknown) {
  if (error instanceof BalanceProviderError) return {category:"provider",httpStatus:error.httpStatus,reason:error.reason};
  if (error instanceof BalanceOutputError) return {category:"provider-output",reason:error.reason};
  if (error instanceof BalanceConfigurationError) return {category:"configuration",reason:error.reason};
  if (error instanceof HttpsError) return {category:"state-check",reason:error.code};
  if (error instanceof SyntaxError) return {category:"invalid-json"};
  if (error instanceof Error && ["TimeoutError","AbortError"].includes(error.name)) return {category:"timeout"};
  if (error instanceof Error && error.message === "GEMINI_API_KEY is not configured") return {category:"configuration"};
  if (error instanceof TypeError) {
    const networkCodes=["ENOTFOUND","ECONNRESET","ECONNREFUSED","ETIMEDOUT","ERR_INVALID_CHAR","UND_ERR_CONNECT_TIMEOUT","UND_ERR_HEADERS_TIMEOUT","CERT_HAS_EXPIRED"];
    const cause=error.cause as {code?:unknown} | undefined;
    const code=typeof cause?.code === "string" && networkCodes.includes(cause.code) ? cause.code : undefined;
    const reason=code ?? (/ByteString|Headers|header/i.test(error.message) ? "INVALID_HEADER" : /fetch failed/i.test(error.message) ? "FETCH_FAILED" : /\.map|\.filter|candidates|parts|Cannot read properties/i.test(error.message) ? "UNEXPECTED_RESPONSE_SHAPE" : "TYPE_ERROR");
    const frame=error.stack?.match(/\/rounds\/balanceGame\.js:(\d+):(\d+)/);
    return {category:"transport-or-format",reason,...(frame?{siteLine:Number(frame[1])}:{})};
  }
  return {category:"matching-failed"};
}

type ActiveStudent = Awaited<ReturnType<typeof requireActiveStudent>>;

function refs(classId: string) {
  const classRef = db.doc(`classes/${classId}`);
  return { classRef, sessionRef: classRef.collection("balanceGameSecrets").doc(gameDocId),
    publicRef: classRef.collection("balanceGamePublic").doc("progress") };
}

function rosterIds(roster: FirebaseFirestore.QuerySnapshot) {
  return roster.docs.map((member) => member.id).sort();
}

function assertRosterSize(ids: string[]) {
  if (ids.length < 2 || ids.length > 40 || ids.length % 2 !== 0) {
    throw new HttpsError("failed-precondition", "짝을 정하려면 학급의 참가 학생이 2명 이상이고 짝수여야 해요. 질문을 살펴보며 선생님의 명단 준비를 기다려 주세요." );
  }
}

async function activeRoster(tx: FirebaseFirestore.Transaction, student: ActiveStudent) {
  await assertStudentTransaction(tx, student.classId, student.uid,
    student.member.get("sessionVersion"), "", false);
  const roster = await tx.get(student.classRef.collection("members").where("accessStatus", "==", "active"));
  const ids = rosterIds(roster);
  if (!ids.includes(student.uid)) throw new HttpsError("permission-denied", "이번 자리바꾸기 참가자가 아니에요.");
  assertRosterSize(ids);
  return roster;
}

function assertSameRoster(session: FirebaseFirestore.DocumentSnapshot, ids: string[], uid?: string) {
  if (!session.exists || (uid && !session.get("participantUids")?.includes(uid))) {
    throw new HttpsError("permission-denied", "이번 자리바꾸기 참가자가 아니에요.");
  }
  if (JSON.stringify(session.get("participantUids")) !== JSON.stringify(ids)) {
    throw new HttpsError("failed-precondition", "학급 명단이 바뀌었어요. 선생님께 새 자리바꾸기 준비를 부탁해 주세요.");
  }
}

async function ensureSession(student: ActiveStudent) {
  const {sessionRef, publicRef} = refs(student.classId);
  const participantCount = await db.runTransaction(async (tx) => {
    const roster = await activeRoster(tx, student);
    const ids = rosterIds(roster);
    const [current, progress] = await tx.getAll(sessionRef, publicRef);
    if (current.exists) { assertSameRoster(current, ids, student.uid); return ids.length; }
    if (progress.exists) throw new HttpsError("internal", "자리바꾸기 진행 정보를 확인할 수 없어요.");
    const names = Object.fromEntries(roster.docs.map((member) => [member.id, String(member.get("displayName") ?? "학생")]));
    const participantKeys = Object.fromEntries(ids.map((uid) => [uid, randomUUID()]));
    tx.create(sessionRef, {state:"collecting", participantUids:ids, participantKeys, names, choicesSubmitted:0,
      createdAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp()});
    tx.create(publicRef, {state:"collecting", participantCount:ids.length, completedCount:0, completedNames:[],
      updatedAt:FieldValue.serverTimestamp()});
    return ids.length;
  });
  return {sessionRef, publicRef, participantCount};
}

function validateChoices(value: unknown): Choice[] {
  if (!Array.isArray(value) || value.length !== questionSet.length
    || value.some((choice) => choice !== "A" && choice !== "B")) {
    throw new HttpsError("invalid-argument", "질문 10개를 모두 골라 주세요.");
  }
  return value as Choice[];
}

export function validatePairs(value: unknown, ids: string[], choices: Record<string, Choice[]>): Pair[] {
  if (!Array.isArray(value) || value.length * 2 !== ids.length) throw new Error("invalid pairs");
  const seen = new Set<string>();
  const pairs = value.map((item): Pair => {
    if (!item || typeof item !== "object") throw new Error("invalid pair");
    const { a, b, score: declaredScore } = item as { a?: unknown; b?: unknown; score?: unknown };
    if (typeof a !== "string" || typeof b !== "string" || a === b || !ids.includes(a) || !ids.includes(b)
      || seen.has(a) || seen.has(b)) throw new Error("invalid pair member");
    seen.add(a); seen.add(b);
    const score = choices[a].reduce((sum, choice, index) => sum + Number(choice === choices[b][index]), 0);
    if (declaredScore !== score) throw new Error("mismatch score");
    return { a, b, score };
  });
  if (seen.size !== ids.length) throw new Error("missing participant");
  return pairs;
}

export async function generatePairsWithGemini(
  entries: Array<{ id: string; choices: Choice[] }>, apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<Pair[]> {
  apiKey=typeof apiKey === "string" ? apiKey.trim() : "";
  if (!apiKey) throw new BalanceConfigurationError("MISSING_API_KEY");
  if (/[^\x21-\x7e]/.test(apiKey)) throw new BalanceConfigurationError("INVALID_API_KEY_FORMAT");
  const ids = entries.map(({ id }) => id);
  const choices = Object.fromEntries(entries.map(({ id, choices: answers }) => [id, answers]));
  const response = await fetcher("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: "짝을 만들 때만 답하세요. 표시 이름이나 개인정보는 입력에 없습니다. 각 참가자의 10개 A/B 선택을 비교하고, 같은 선택이 많은 학생끼리 짝을 만드세요. 짝들의 같은 선택 개수 합계가 가장 크게 되도록 하며, 각 짝마다 같은 선택 개수를 정확히 적으세요. 모든 참가자는 정확히 한 번만 포함해야 합니다. 성격·인기·친구 관계를 판단하지 마세요." }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify(entries) }] }],
      generationConfig: { thinkingConfig:{thinkingLevel:"low"}, maxOutputTokens: 8192, responseMimeType: "application/json", responseSchema: {
        type: "OBJECT", properties: { pairs: { type: "ARRAY", items: { type: "OBJECT",
          properties: { a: { type: "STRING" }, b: { type: "STRING" }, score: { type: "INTEGER" } }, required: ["a", "b", "score"] } } }, required: ["pairs"],
      } },
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as {error?:{details?:Array<{reason?:unknown}>}} | null;
    const knownReasons = ["API_KEY_INVALID","API_KEY_SERVICE_BLOCKED","API_KEY_IP_ADDRESS_BLOCKED","API_KEY_HTTP_REFERRER_BLOCKED","SERVICE_DISABLED","BILLING_DISABLED"];
    const reason = body?.error?.details?.map((detail) => detail.reason).find((value) => typeof value === "string" && knownReasons.includes(value));
    throw new BalanceProviderError(response.status, typeof reason === "string" ? reason : "PROVIDER_REQUEST_FAILED");
  }
  const body = await response.json() as { candidates?: Array<{ finishReason?:string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> };
  const text = body.candidates?.[0]?.content?.parts?.filter((part) => part.text && !part.thought).map((part) => part.text).join("");
  if (!text) {
    const finish=body.candidates?.[0]?.finishReason;
    throw new BalanceOutputError(["MAX_TOKENS","SAFETY","RECITATION","BLOCKLIST","PROHIBITED_CONTENT"].includes(finish ?? "") ? finish! : "EMPTY_OUTPUT");
  }
  const generated = JSON.parse(text) as { pairs?: unknown };
  try { return validatePairs(generated.pairs, ids, choices); }
  catch (error) {
    const reasons:Record<string,string>={"invalid pairs":"INVALID_PAIR_COUNT","invalid pair":"INVALID_PAIR","invalid pair member":"INVALID_PAIR_MEMBER","mismatch score":"INVALID_PAIR_SCORE","missing participant":"MISSING_PARTICIPANT"};
    throw new BalanceOutputError(error instanceof Error ? reasons[error.message] ?? "INVALID_PAIRS" : "INVALID_PAIRS");
  }
}

export async function completeMatching(student: Pick<ActiveStudent, "classId">,
  sessionRef: FirebaseFirestore.DocumentReference, attemptId: string,
  provider: (entries: Array<{id:string;choices:Choice[]}>) => Promise<Pair[]> = (entries) => generatePairsWithGemini(entries, geminiApiKey.value())) {
  const {classRef, publicRef} = refs(student.classId);
  try {
    const session = await sessionRef.get();
    if (!session.exists || session.get("state") !== "matching" || session.get("matchingAttemptId") !== attemptId) return;
    const uids = session.get("participantUids") as string[];
    const participantKeys = session.get("participantKeys") as Record<string, string>;
    const entries = await Promise.all(uids.map(async (uid) => {
      const submission = await sessionRef.collection("submissions").doc(uid).get();
      if (!submission.exists) throw new Error("A participant response is missing");
      return {id:participantKeys[uid], choices:submission.get("choices") as Choice[]};
    }));
    const pairs = await provider(entries);
    const assignments: Record<string, string> = {};
    for (const pair of pairs) {
      const a = uids.find((uid) => participantKeys[uid] === pair.a)!;
      const b = uids.find((uid) => participantKeys[uid] === pair.b)!;
      assignments[a] = b; assignments[b] = a;
    }
    await db.runTransaction(async (tx) => {
      const [current, classDoc] = await tx.getAll(sessionRef, classRef);
      const roster = await tx.get(classRef.collection("members").where("accessStatus", "==", "active"));
      if (!current.exists || current.get("state") !== "matching" || current.get("matchingAttemptId") !== attemptId) return;
      if (classDoc.get("status") !== "active") throw new HttpsError("failed-precondition", "학급 활동이 멈춰 짝을 공개할 수 없어요.");
      assertSameRoster(current, rosterIds(roster));
      tx.update(sessionRef, {state:"complete", assignments, matchedAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp()});
      tx.update(publicRef, {state:"complete", updatedAt:FieldValue.serverTimestamp()});
      tx.create(classRef.collection("auditLogs").doc(), {action:"balance_game.matched", actorUid:"system",
        gameId:gameDocId, participantCount:uids.length, createdAt:FieldValue.serverTimestamp()});
    });
  } catch (error) {
    warn("balance_game.match_failed", balanceMatchingFailureDetails(error));
    await db.runTransaction(async (tx) => {
      const [current, progress] = await tx.getAll(sessionRef, publicRef);
      if (current.exists && current.get("state") === "matching" && current.get("matchingAttemptId") === attemptId) {
        tx.update(sessionRef, {state:"failed", updatedAt:FieldValue.serverTimestamp()});
        if (progress.exists) tx.update(publicRef, {state:"failed", updatedAt:FieldValue.serverTimestamp()});
      }
    });
    throw new HttpsError("unavailable", "짝을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
}

export const getStudentBalanceGame = onCall(async (request) => {
  if (request.data !== null && request.data !== undefined) requireRecord(request.data);
  const student = await requireActiveStudent(request);
  let ready: Awaited<ReturnType<typeof ensureSession>>;
  try { ready = await ensureSession(student); }
  catch (error) {
    if (!(error instanceof HttpsError) || error.code !== "failed-precondition") throw error;
    return {gameId:null, questions:questionSet, state:"collecting", choices:null, progress:null,
      partnerName:null, canRetry:false, canSubmit:false, availabilityMessage:error.message};
  }
  const {sessionRef, publicRef, participantCount} = ready;
  const [session, ownSubmission, progress] = await db.getAll(sessionRef, sessionRef.collection("submissions").doc(student.uid), publicRef);
  if (!session.exists || !session.get("participantUids").includes(student.uid)) {
    throw new HttpsError("permission-denied", "이번 자리바꾸기 참가자가 아니에요.");
  }
  const state = session.get("state") as string;
  const matchStartedAt = session.get("matchingStartedAt")?.toMillis() ?? 0;
  const canRetry = state === "failed" || (state === "matching" && Date.now() - matchStartedAt > 180_000);
  const partnerUid = state === "complete" ? session.get("assignments")?.[student.uid] : undefined;
  const partnerName = partnerUid ? session.get("names")?.[partnerUid] ?? null : null;
  return {gameId:gameDocId, questions:questionSet, state,
    choices:ownSubmission.exists ? ownSubmission.get("choices") as Choice[] : null,
    progress:{completedCount:progress.get("completedCount") as number, participantCount:progress.get("participantCount") as number},
    partnerName, canSubmit:state === "collecting", availabilityMessage:null,
    canRetry:canRetry && progress.get("completedCount") === participantCount};
});

export const submitBalanceGameChoices = onCall({secrets:[geminiApiKey],timeoutSeconds:120,memory:"512MiB"}, async (request) => {
  const input = requireRecord(request.data);
  const choices = validateChoices(input.choices);
  const student = await requireActiveStudent(request);
  const {sessionRef, publicRef} = await ensureSession(student);
  const ownRef = sessionRef.collection("submissions").doc(student.uid);
  const attemptId = await db.runTransaction(async (tx) => {
    const roster = await activeRoster(tx, student);
    const [current, submitted, progress] = await tx.getAll(sessionRef, ownRef, publicRef);
    assertSameRoster(current, rosterIds(roster), student.uid);
    if (submitted.exists) return null;
    if (current.get("state") !== "collecting") throw new HttpsError("failed-precondition", "제출을 받지 않는 상태예요.");
    const submissions = await tx.get(sessionRef.collection("submissions"));
    const displayName = String(roster.docs.find((member) => member.id === student.uid)?.get("displayName") ?? "학생");
    const completedNames = [...(progress.get("completedNames") as string[] ?? []), displayName];
    const completedCount = submissions.size + 1;
    const matchAttempt = completedCount === current.get("participantUids").length ? randomUUID() : null;
    tx.create(ownRef, {choices, submittedAt:FieldValue.serverTimestamp()});
    tx.update(sessionRef, {choicesSubmitted:completedCount, updatedAt:FieldValue.serverTimestamp(),
      ...(matchAttempt ? {state:"matching", matchingStartedAt:FieldValue.serverTimestamp(), matchingAttemptId:matchAttempt} : {})});
    tx.update(publicRef, {completedCount, completedNames, state:matchAttempt ? "matching" : "collecting", updatedAt:FieldValue.serverTimestamp()});
    return matchAttempt;
  });
  if (attemptId) await completeMatching(student, sessionRef, attemptId);
  return {submitted:true};
});

export const retryStudentBalanceMatching = onCall({secrets:[geminiApiKey],timeoutSeconds:120,memory:"512MiB"}, async (request) => {
  if (request.data !== null && request.data !== undefined) requireRecord(request.data);
  const student = await requireActiveStudent(request);
  const {sessionRef, publicRef} = await ensureSession(student);
  const attemptId = await db.runTransaction(async (tx) => {
    const roster = await activeRoster(tx, student);
    const [session, progress] = await tx.getAll(sessionRef, publicRef);
    assertSameRoster(session, rosterIds(roster), student.uid);
    if (progress.get("completedCount") !== session.get("participantUids").length) throw new HttpsError("failed-precondition", "모든 학생이 선택을 마친 뒤에 다시 시도할 수 있어요.");
    if (session.get("state") === "complete") return null;
    if (session.get("state") === "matching") {
      const startedAt = session.get("matchingStartedAt")?.toMillis() ?? 0;
      if (Date.now() - startedAt <= 180_000) throw new HttpsError("failed-precondition", "짝을 만들고 있어요. 잠시 기다려 주세요.");
    } else if (session.get("state") !== "failed") throw new HttpsError("failed-precondition", "다시 시도할 수 있는 상태가 아니에요.");
    const matchAttempt = randomUUID();
    tx.update(sessionRef, {state:"matching", matchingStartedAt:FieldValue.serverTimestamp(), matchingAttemptId:matchAttempt, updatedAt:FieldValue.serverTimestamp()});
    tx.update(publicRef, {state:"matching", updatedAt:FieldValue.serverTimestamp()});
    return matchAttempt;
  });
  if (attemptId) await completeMatching(student, sessionRef, attemptId);
  return {submitted:true};
});
