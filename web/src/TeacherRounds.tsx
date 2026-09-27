import React, { useCallback, useEffect, useRef, useState } from "react";
import { call } from "./firebase";
import { CheckboxRow, ConfirmDialog } from "./DesignSystem";

type Member = { studentUid: string; displayName: string; accessStatus: string };
type Round = { roundId: string; title: string; status: string; startsAt: string; endsAt: string;
  activityDates: string[]; participantCount: number; rosterVersion: number; allowFreeTextMessages: boolean };
type Overview = { helps: Array<{helpId: string; studentName: string; category: string; note: string; messageId: string | null}>;
  pendingMessages: Array<{messageId: string; senderName: string; receiverName: string; text: string}>;
  participation: Array<{studentUid: string; displayName: string; status: string; accessStatus: string;
  lastLoginAt: string | null; hasActivity: boolean}>; activityDates: string[] };
type Summary = { helpCount: number; pendingMessageCount: number; participantCount: number; activityDates: string[];
  helps?: Overview["helps"]; pendingMessages?: Overview["pendingMessages"] };
type Assignment = { giverUid: string; giverName: string; receiverName: string };
type SafetyMessage = { text: string; senderName: string; receiverName: string; status: string };
type Mission = {missionId: string; text: string; category: string};
type MonitoredMessage = {messageId: string; senderName: string; receiverName: string;
  date: string; status: string; kind: string; replyToMessageId: string | null};
type Settings = { participantIds: string[]; excludedPairs: Array<{a: string; b: string}>;
  missionIds: string[]; activityDates: string[] };

const roundStatusLabels: Record<string, string> = {
  draft: "준비 중", ready: "시작 준비 완료", active: "진행 중", paused: "일시정지",
  reveal_pending: "공개 대기", revealed: "공개 완료", archived: "보관", cancelled: "취소",
};
const participationLabels: Record<string, string> = { active: "참여 중", stopped: "참여 중단" };
const helpCategoryLabels: Record<string, string> = { uncomfortable: "불편·걱정", message: "쪽지 신고" };
const missionCategoryNames = ["인사와 칭찬", "경청과 대화", "협력과 배려", "감사와 응원", "우리 반 미션"];

function koreaDay(date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {timeZone:"Asia/Seoul", year:"numeric", month:"2-digit", day:"2-digit"}).format(date);
}

function addDays(day: string, count: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function schoolDays(start: string, end: string): string[] {
  const dates: string[] = [];
  if (!start || !end || end < start) return dates;
  for (let day = start; day <= end && dates.length < 20; day = addDays(day, 1)) {
    const weekDay = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (weekDay !== 0 && weekDay !== 6) dates.push(day);
  }
  return dates;
}

function startOfKoreaDay(day: string): string { return new Date(`${day}T00:00:00+09:00`).toISOString(); }
function endOfKoreaDay(day: string): string { return new Date(`${day}T23:59:59.999+09:00`).toISOString(); }

export type TeacherRoundView = "overview" | "rounds" | "safety" | "history";
export function TeacherRounds({ classId, gradeBand, members, view, onNavigate, onDirtyChange }: {
  classId: string; gradeBand: string; members: Member[]; view: TeacherRoundView;
  onNavigate: (view: TeacherRoundView) => void; onDirtyChange?: (dirty: boolean) => void;
}) {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [roundsError, setRoundsError] = useState(false);
  const [chosen, setChosen] = useState<string>("");
  const chosenRef = useRef("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const assignmentRequest = useRef(0);
  const [catalog, setCatalog] = useState<Mission[]>([]);
  const [catalogError, setCatalogError] = useState(false);
  const [customMission, setCustomMission] = useState("");
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(() => koreaDay());
  const [end, setEnd] = useState(() => addDays(koreaDay(), 4));
  const [dates, setDates] = useState(() => schoolDays(koreaDay(), addDays(koreaDay(), 4)).join(", "));
  const [step, setStep] = useState(1);
  const [creating, setCreating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [confirmAction, setConfirmAction] = useState<{name: string; studentUid?: string} | null>(null);
  const [overviewError, setOverviewError] = useState(false);
  const safetyRequest = useRef(0);
  const summaryRequest = useRef(0);
  const [participants, setParticipants] = useState<string[]>([]);
  const [excludedPairs, setExcludedPairs] = useState<Array<{a: string; b: string}>>([]);
  const [pairA, setPairA] = useState("");
  const [pairB, setPairB] = useState("");
  const [missionIds, setMissionIds] = useState<string[]>([]);
  const [nextTitle, setNextTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stepError, setStepError] = useState("");
  const [notice, setNotice] = useState("");
  const [resolution, setResolution] = useState<Record<string, string>>({});
  const [safetyMessages, setSafetyMessages] = useState<Record<string, SafetyMessage>>({});
  const [monitoredMessages, setMonitoredMessages] = useState<MonitoredMessage[]>([]);
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [messageListError, setMessageListError] = useState(false);
  const [moderationTarget, setModerationTarget] = useState<string | null>(null);
  const [openHelpId, setOpenHelpId] = useState<string | null>(null);
  const [openReviewMessageId, setOpenReviewMessageId] = useState<string | null>(null);
  const pendingSave = useRef<{key: string; requestId: string} | null>(null);
  const pendingStatusAction = useRef<{key: string; requestId: string} | null>(null);
  useEffect(() => { onDirtyChange?.(view === "rounds" && creating && dirty); }, [view, creating, dirty, onDirtyChange]);

  const load = useCallback(async () => {
    const result = await call<{classId: string}, {rounds: Round[]}>("listRounds", {classId});
    setRounds(result.rounds); setRoundsError(false);
  }, [classId]);
  const loadOverview = useCallback(async (roundId: string) => {
    const result = await call<object, Overview>("getTeacherRoundOverview", {classId, roundId});
    if (chosenRef.current === roundId) { setOverview(result); setOverviewError(false); }
  }, [classId]);
  const loadSummary = useCallback(async (roundId: string) => {
    const version = ++summaryRequest.current;
    const result = await call<object, Summary>("getTeacherRoundOverview", {classId, roundId, summaryOnly: true});
    if (version !== summaryRequest.current) return;
    setSummary({ helpCount: result.helpCount ?? result.helps?.length ?? 0,
      pendingMessageCount: result.pendingMessageCount ?? result.pendingMessages?.length ?? 0,
      participantCount: result.participantCount, activityDates: result.activityDates });
    setOverviewError(false);
  }, [classId]);
  useEffect(() => { assignmentRequest.current++; summaryRequest.current++; chosenRef.current = ""; setChosen(""); setOverview(null); setSummary(null); setAssignments(null); void load().catch(() => {setRoundsError(true); setError("시즌 목록을 불러오지 못했어요.");}); }, [load]);
  async function loadCatalog() {
    try {
      const result = await call<object, {missions: Mission[]}>("getMissionCatalog", {classId, gradeBand});
      setCatalog(result.missions); setCatalogError(false);
    } catch { setCatalogError(true); }
  }
  async function addCustomMission() {
    if (!customMission.trim()) return;
    await run(async () => {
      const result = await call<object, Mission>("createCustomMission", {classId,
        text: customMission.trim(), requestId: crypto.randomUUID()});
      setCatalog((old) => [...old, result]);
      setCustomMission("");
      if (missionIds.length < 3) setMissionIds((old) => [...old, result.missionId]);
      markChanged();
      setNotice("우리 반 미션을 추가했어요.");
    });
  }
  async function loadMonitoredMessages(roundId: string, cursor?: string) {
    try {
      const result = await call<object, {messages: MonitoredMessage[]; nextCursor: string | null}>(
        "listTeacherMessages", {classId, roundId, ...(cursor ? {cursor} : {})});
      if (view !== "safety" || chosenRef.current !== roundId) return;
      setMonitoredMessages((old) => cursor ? [...old, ...result.messages] : result.messages);
      setMessageCursor(result.nextCursor);
      setMessageListError(false);
    } catch { setMessageListError(true); }
  }
  async function hideForClass(messageId: string) {
    if (!current) return;
    const roundId = current.roundId;
    await run(async () => {
      await call<object, object>("moderateMessage", {classId, roundId, messageId,
        requestId: crypto.randomUUID()});
      setMonitoredMessages((old) => old.map((item) => item.messageId === messageId
        ? {...item, status:"moderated"} : item));
      setSafetyMessages((old) => {const next = {...old}; delete next[messageId]; return next;});
      setNotice("쪽지를 학생 화면에서 숨겼어요.");
    });
  }
  useEffect(() => { void loadCatalog(); }, [classId, gradeBand]);
  useEffect(() => { setParticipants(members.filter((m) => m.accessStatus === "active").map((m) => m.studentUid)); }, [members]);
  useEffect(() => {
    const hide = () => { if (document.visibilityState !== "visible") {
      assignmentRequest.current++; safetyRequest.current++; setAssignments(null); setSafetyMessages({});
      setOpenHelpId(null); setOpenReviewMessageId(null); setMonitoredMessages([]);
    } };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  const activeRound = rounds.find((item) => ["active","paused","reveal_pending"].includes(item.status))
    ?? rounds.find((item) => item.status === "revealed");
  const roundOrder = (status: string) => ["active","paused","reveal_pending"].includes(status) ? 0
    : ["ready","draft"].includes(status) ? 1 : 2;
  const orderedRounds = [...rounds].sort((a,b) => roundOrder(a.status) - roundOrder(b.status)
    || b.startsAt.localeCompare(a.startsAt));
  const chosenRound = rounds.find((item) => item.roundId === chosen);
  const current = view === "safety" ? activeRound : chosenRound;
  useEffect(() => {
    if (view === "overview") {
      if (activeRound) void loadSummary(activeRound.roundId).catch(() => setOverviewError(true));
      else setSummary(null);
    }
    if (view === "safety" && activeRound) {
      if (chosenRef.current !== activeRound.roundId) void selectRound(activeRound.roundId);
      else {void loadOverview(activeRound.roundId).catch(() => setOverviewError(true));
        void loadMonitoredMessages(activeRound.roundId);}
    }
  }, [view, activeRound?.roundId]);
  useEffect(() => {
    if (view !== "safety") { safetyRequest.current++; setSafetyMessages({}); setOpenHelpId(null); setOpenReviewMessageId(null);
      setMonitoredMessages([]); setMessageCursor(null); }
    if (view !== "rounds") { assignmentRequest.current++; setAssignments(null); }
    if (view !== "rounds" && creating) { setCreating(false); setDirty(false); }
  }, [view]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action();
      try { await load(); if (chosenRef.current) {
        if (view === "safety") await loadOverview(chosenRef.current);
        else await loadSummary(chosenRef.current);
      } }
      catch { setError("작업은 완료됐어요. 최신 목록을 다시 불러와 주세요."); }
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : "처리하지 못했어요."); }
    finally { setBusy(false); }
  }
  function formData() {
    return { classId, title, startsAt: startOfKoreaDay(start), endsAt: endOfKoreaDay(end),
      activityDates: dates.split(/[\s,]+/).filter(Boolean), participantIds: participants,
      excludedPairs: excludedPairs.map(({a,b}) => [a,b]), missionIds, allowFreeTextMessages: true };
  }
  async function saveRound(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      const payload = formData();
      if (missionIds.length !== 3) throw new Error("미션 3개를 선택해 주세요.");
      const key = JSON.stringify([current?.roundId ?? null, payload]);
      if (pendingSave.current?.key !== key) pendingSave.current = {key, requestId: crypto.randomUUID()};
      const result = current && ["draft", "ready"].includes(current.status)
        ? await call<object, {roundId: string}>("updateRound", {...payload, roundId: current.roundId, requestId: pendingSave.current.requestId})
        : await call<object, {roundId: string}>("createRound", {...payload, requestId: pendingSave.current.requestId});
      pendingSave.current = null;
      chosenRef.current = result.roundId; setChosen(result.roundId); setDirty(false); setCreating(false);
      setNotice("준비 내용을 저장했어요. 조건을 확인한 뒤 시작할 수 있어요.");
    });
  }
  async function action(name: string) {
    if (!current) return;
    assignmentRequest.current++;
    setAssignments(null);
    await run(async () => {
      const key = JSON.stringify([name, current.roundId, current.rosterVersion]);
      if (pendingStatusAction.current?.key !== key) pendingStatusAction.current = {key, requestId: crypto.randomUUID()};
      const requestId = pendingStatusAction.current.requestId;
      if (name === "prepare") {
        await call<object, object>("prepareRound", {classId, roundId: current.roundId});
      } else if (name === "start") {
        await call<object, object>("startRound", {classId, roundId: current.roundId,
          rosterVersion: current.rosterVersion, requestId});
      } else if (name === "reveal") {
        await call<object, object>("revealRound", {classId, roundId: current.roundId, requestId});
      } else {
        await call<object, object>("changeRoundStatus", {classId, roundId: current.roundId,
          action: name, requestId});
      }
      pendingStatusAction.current = null;
      setNotice("시즌 상태를 변경했어요.");
    });
  }
  async function selectRound(roundId: string) {
    assignmentRequest.current++;
    chosenRef.current = roundId;
    setChosen(roundId); setAssignments(null); setOverview(null); setSummary(null); setSafetyMessages({}); setOpenHelpId(null); setOpenReviewMessageId(null);
    if (!roundId) { setTitle(""); setExcludedPairs([]); setMissionIds([]);
      setParticipants(members.filter((m) => m.accessStatus === "active").map((m) => m.studentUid));
      const today = koreaDay(); const lastDay = addDays(today, 4);
      setStart(today); setEnd(lastDay); setDates(schoolDays(today, lastDay).join(", "));
      setStep(1); setDirty(false); return; }
    try {
      const round = rounds.find((r) => r.roundId === roundId);
      const settings = await call<object, Settings>("getRoundSettingsForTeacher", {classId, roundId});
      if (chosenRef.current !== roundId) return;
      if (round) { setTitle(round.title); setStart(koreaDay(new Date(round.startsAt))); setEnd(koreaDay(new Date(round.endsAt))); }
      setParticipants(settings.participantIds); setMissionIds(settings.missionIds);
      setDates(settings.activityDates.length ? settings.activityDates.join(", ") : schoolDays(koreaDay(), addDays(koreaDay(), 4)).join(", "));
      setExcludedPairs(settings.excludedPairs);
      setStep(1); setDirty(false);
    if (view === "safety") {await loadOverview(roundId); await loadMonitoredMessages(roundId);}
      else await loadSummary(roundId);
    } catch { setOverviewError(true); setError("시즌 현황을 불러오지 못했어요. 다시 시도해 주세요."); }
  }
  async function review(messageId: string, decision: "approve" | "reject") {
    if (!current) return;
    await run(async () => { await call<object, object>("reviewMessage", {classId, roundId: current.roundId,
      messageId, decision, requestId: crypto.randomUUID()}); setNotice("쪽지를 검토했어요."); });
  }
  async function resolve(helpId: string) {
    if (!current) return;
    await run(async () => { await call<object, object>("resolveHelpRequest", {classId, roundId: current.roundId,
      helpId, resolution: resolution[helpId], requestId: crypto.randomUUID()}); setNotice("도움 요청을 처리했어요."); });
  }
  async function inspectMessage(messageId: string) {
    if (!current) return;
    const version = ++safetyRequest.current;
    await run(async () => {
      const result = await call<object, SafetyMessage>("getMessageForReview", {classId,
        roundId: current.roundId, messageId});
      if (version === safetyRequest.current && view === "safety" && document.visibilityState === "visible"
        && chosenRef.current === current.roundId) setSafetyMessages((old) => ({...old, [messageId]: result}));
    });
  }
  async function stop(studentUid: string) {
    if (!current) return;
    await run(async () => { await call<object, object>("stopRoundParticipation", {classId,
      roundId: current.roundId, studentUid, requestId: crypto.randomUUID()}); setNotice("참여를 중단했어요."); });
  }
  async function copySettings() {
    if (!current || !nextTitle.trim()) return;
    await run(async () => {
      const nextStart = koreaDay(); const nextEnd = addDays(nextStart, 4);
      const result = await call<object, {roundId: string}>("copyRoundSettings", {classId,
        sourceRoundId: current.roundId, title: nextTitle, startsAt: startOfKoreaDay(nextStart),
        endsAt: endOfKoreaDay(nextEnd), requestId: crypto.randomUUID()});
      chosenRef.current = result.roundId; setChosen(result.roundId); setTitle(nextTitle); setStart(nextStart);
      setEnd(nextEnd); setDates(schoolDays(nextStart, nextEnd).join(", "));
      setStep(1); setDirty(false); setCreating(true); onNavigate("rounds");
      setNotice("설정을 복사했어요. 수업일을 확인하고 저장해 주세요.");
    });
  }

  const selectedDates = dates.split(/[\s,]+/).filter(Boolean);
  function markChanged() { setDirty(true); setNotice(""); setStepError(""); }
  function chooseRound(roundId: string, edit = false) {
    if (dirty && !window.confirm("저장하지 않은 준비 내용이 있어요. 입력을 버리고 이동할까요?")) return;
    setCreating(edit); void selectRound(roundId);
  }
  function nextStep() {
    setError(""); setStepError("");
    if (step === 1 && (!title.trim() || !start || !end || end < start
      || new Date(endOfKoreaDay(end)).getTime() - new Date(startOfKoreaDay(start)).getTime() > 30 * 86400_000
      || selectedDates.length < 3 || selectedDates.length > 20
      || selectedDates.some((day) => day < start || day > end))) {
      setStepError("주제와 시작·종료일을 확인하고, 기간 안의 수업일을 3~20일 선택해 주세요."); return;
    }
    if (step === 2 && (participants.length < 4 || participants.length > 40
      || excludedPairs.some((pair) => !participants.includes(pair.a) || !participants.includes(pair.b)))) {
      setStepError("참가 학생 4~40명과 참가자 사이의 제외 관계를 확인해 주세요."); return;
    }
    if (step === 3 && missionIds.length !== 3) { setStepError("미션을 정확히 3개 선택해 주세요."); return; }
    setStep((value) => Math.min(5, value + 1)); window.scrollTo(0,0);
  }
  function askAction(name: string, studentUid?: string) { setConfirmAction({name, studentUid}); }
  function confirmedAction() {
    const pending = confirmAction;
    setConfirmAction(null);
    if (!pending) return;
    if (pending.name === "stop" && pending.studentUid) void stop(pending.studentUid);
    else void action(pending.name);
  }
  const confirmLabels: Record<string,{title:string; detail:string; button:string}> = {
    start: {title:"매칭하고 시작할까요?",detail:`${current?.title ?? "이 활동"}의 배정을 확정합니다. 시작 뒤에는 같은 활동을 다시 추첨할 수 없어요.`,button:"매칭하고 시작"},
    end: {title:"활동을 종료할까요?",detail:`${current?.title ?? "이 활동"}의 새 제출을 닫고 공개 대기로 옮깁니다. 친구 정체는 아직 공개되지 않아요.`,button:"활동 종료"},
    reveal: {title:"친구 정체를 공개할까요?",detail:`${current?.title ?? "이 활동"}에서 처리할 도움·쪽지가 없는지 서버가 다시 확인합니다. 승인하면 학생별 본인 관계가 공개됩니다.`,button:"정체 공개 승인"},
    cancel: {title:"시즌을 취소할까요?",detail:`${current?.title ?? "이 활동"}을 취소합니다. 참가자는 이 시즌에서 더 활동할 수 없어요.`,button:"시즌 취소"},
    stop: {title:"학생 참여를 중단할까요?",detail:`${overview?.participation.find((p) => p.studentUid === confirmAction?.studentUid)?.displayName ?? "선택한 학생"}의 이 시즌 제출과 정체 공개를 차단합니다.`,button:"참여 중단"},
  };
  const confirmation = confirmAction ? confirmLabels[confirmAction.name] : null;

  return <section className="panel round-panel">
    <div className="page-header"><div><h2>{view === "overview" ? "운영 요약" : view === "rounds" ? "시즌 설정" : view === "safety" ? "안전 확인" : "지난 활동"}</h2>
      <p>{view === "overview" ? "도움 요청과 쪽지 대화를 먼저 확인하세요." : view === "rounds" ? "준비부터 공개까지 시즌별로 운영해요." : view === "safety" ? "요청과 쪽지를 비공개로 확인하고 처리해요." : "지난 기록과 다음 활동 준비를 살펴봐요."}</p></div>
      {view === "rounds" && <div className="page-actions"><button type="button" className="outline" onClick={() => chooseRound("")}>시즌 목록</button>
        <button type="button" onClick={() => chooseRound("", true)}>새 시즌 준비</button></div>}
    </div>
    {error && <p className="message error" role="alert">{error}</p>}
    {notice && <p className="message success" role="status">{notice}</p>}
    {view === "overview" && <div className="stack">
      {activeRound ? <p><strong>{activeRound.title}</strong> · {roundStatusLabels[activeRound.status]} · {activeRound.participantCount}명</p> : <p>진행 중인 시즌이 없어요. 학생을 등록하고 새 시즌을 준비할 수 있어요.</p>}
      {overviewError ? <p className="message error" role="alert">현황을 불러오지 못했어요. <button className="small outline" onClick={() => activeRound && void loadSummary(activeRound.roundId).catch(() => setOverviewError(true))}>다시 시도</button></p>
        : activeRound && !summary ? <p>현황을 불러오는 중이에요…</p> : null}
      <h3>먼저 확인해 주세요</h3><div className="teacher-overview-grid">
        <button type="button" className="task-card" onClick={() => onNavigate("safety")}><strong>도움 요청 {summary?.helpCount ?? "확인 중"}건</strong><span>안전 확인에서 살펴보기</span></button>
        <button type="button" className="task-card" onClick={() => onNavigate("safety")}><strong>쪽지 대화 모니터링</strong><span>주고받은 쪽지 살펴보기</span></button>
      </div>
      {summary && <><h3>접속·활동 확인</h3><p className="field-help">학생별 지원 현황은 안전 확인에서 비공개로 볼 수 있어요.</p>
        <p>참가 학생 {summary.participantCount ?? activeRound?.participantCount ?? 0}명</p>
        <h3>일정</h3><p>{summary.activityDates.join(" · ") || "수업일 정보가 없어요."}</p></>}
      <div className="overview-next-action"><button className="outline" onClick={() => onNavigate("rounds")}>{activeRound ? "진행 시즌 자세히 보기" : "새 시즌 준비하기"}</button></div>
    </div>}

    {view === "rounds" && !creating && !current && <div className="round-list">
      {roundsError ? <p className="message error" role="alert">시즌 목록을 불러오지 못했어요. <button className="small outline" onClick={() => void load().catch(() => setRoundsError(true))}>다시 시도</button></p> : rounds.length === 0 ? <p className="muted">아직 시즌이 없어요. 새 시즌을 준비해 보세요.</p> : orderedRounds.map((round) =>
        <button key={round.roundId} type="button" onClick={() => chooseRound(round.roundId)}><strong>{round.title}</strong>
          <small>{roundStatusLabels[round.status] ?? round.status} · {round.participantCount}명 · {round.activityDates.length}수업일</small></button>)}
    </div>}

    {view === "rounds" && creating && (!current || ["draft","ready"].includes(current.status)) && <form className="teacher-page-form stack" onSubmit={(event) => { if (step === 5) void saveRound(event); else { event.preventDefault(); nextStep(); } }}>
      <p className="form-status">{dirty || !current ? "준비 내용: 아직 저장 전" : "저장된 준비 내용"}</p>
      <ol className="round-nav" aria-label="준비 단계">{["기본 정보","참가자·제외","미션","쪽지","확인·저장"].map((label,index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined}>{index + 1} {label}</li>)}</ol>
      {step === 1 && <><h3>1. 기본 정보</h3><label>활동 주제<input required maxLength={60} value={title} aria-invalid={!!stepError && !title.trim()} aria-describedby={stepError ? "round-step-error" : undefined} onChange={(event) => { setTitle(event.target.value); markChanged(); }} /></label>
        <div className="form-grid"><label>시작일<input required type="date" value={start} onChange={(event) => { const next = event.target.value; const nextEnd = end < next ? addDays(next, 4) : end; setStart(next); setEnd(nextEnd); setDates(schoolDays(next, nextEnd).join(", ")); markChanged(); }} /></label>
          <label>종료일<input required type="date" min={start} value={end} onChange={(event) => { const next = event.target.value; setEnd(next); setDates(schoolDays(start, next).join(", ")); markChanged(); }} /></label></div>
        <div className="season-presets" role="group" aria-label="시즌 기간 빠른 선택"><span>시작일 포함</span>{[5,10,15,20].map((days) => <button key={days} type="button" className={end === addDays(start, days - 1) ? "" : "outline"} aria-pressed={end === addDays(start, days - 1)} disabled={!start} onClick={() => { const next = addDays(start, days - 1); setEnd(next); setDates(schoolDays(start, next).join(", ")); markChanged(); }}>{days}일</button>)}</div>
        <p className="field-help">선택한 기간의 평일 {selectedDates.length}일을 활동일로 사용해요.</p></>}
      {step === 2 && <><h3>2. 참가자와 필수 제외 관계</h3><p>{participants.length}명 선택 · {members.length - participants.length}명 미선택</p>
        <label>학생 찾기<input type="search" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="표시 이름 검색" /></label>
        <div className="action-row"><button type="button" className="small outline" onClick={() => { setParticipants(members.filter((m) => m.accessStatus === "active").map((m) => m.studentUid)); markChanged(); }}>입장 가능한 학생 전체 선택</button><button type="button" className="small outline" onClick={() => { setParticipants([]); setExcludedPairs([]); markChanged(); }}>선택 해제</button></div>
        <fieldset aria-describedby={stepError ? "round-step-error" : undefined}><legend>참가 학생 ({participants.length}명)</legend><div className="participant-grid">{members.filter((m) => m.displayName.includes(memberSearch)).map((m) => <CheckboxRow key={m.studentUid} checked={participants.includes(m.studentUid)} disabled={m.accessStatus !== "active"} onChange={(checked) => { setParticipants((old) => checked ? [...old,m.studentUid] : old.filter((id) => id !== m.studentUid)); setExcludedPairs((old) => old.filter((p) => checked || (p.a !== m.studentUid && p.b !== m.studentUid))); markChanged(); }}>{m.displayName}{m.accessStatus !== "active" ? " · 입장 제한" : ""}</CheckboxRow>)}</div></fieldset>
        <fieldset><legend>필수 제외 관계 · {excludedPairs.length}쌍</legend><p className="field-help">서로 배정되지 않아야 할 두 학생을 선택해 주세요. 양방향으로 적용됩니다.</p>
          <div className="action-row"><select aria-label="첫 번째 참가자" value={pairA} onChange={(e) => setPairA(e.target.value)}><option value="">첫 번째 학생</option>{members.filter((m) => participants.includes(m.studentUid)).map((m) => <option key={m.studentUid} value={m.studentUid}>{m.displayName}</option>)}</select>
            <select aria-label="두 번째 참가자" value={pairB} onChange={(e) => setPairB(e.target.value)}><option value="">두 번째 학생</option>{members.filter((m) => participants.includes(m.studentUid)).map((m) => <option key={m.studentUid} value={m.studentUid}>{m.displayName}</option>)}</select>
            <button type="button" className="small outline" disabled={!pairA || !pairB || pairA === pairB} onClick={() => { if (!excludedPairs.some((p) => [p.a,p.b].includes(pairA) && [p.a,p.b].includes(pairB))) { setExcludedPairs((old) => [...old,{a:pairA,b:pairB}]); markChanged(); } setPairA(""); setPairB(""); }}>제외 추가</button></div>
          <ul>{excludedPairs.map((p) => <li key={`${p.a}_${p.b}`}>{members.find((m) => m.studentUid === p.a)?.displayName} ↔ {members.find((m) => m.studentUid === p.b)?.displayName} <button type="button" className="small outline" onClick={() => { setExcludedPairs((old) => old.filter((pair) => pair !== p)); markChanged(); }}>제거</button></li>)}</ul></fieldset></>}
      {step === 3 && <><h3>3. 미션</h3><p>이번 시즌에 사용할 미션을 3개 골라 주세요. <strong>선택 {missionIds.length}/3</strong></p>
        {catalogError && <p className="message error" role="alert">미션 목록을 불러오지 못했어요. <button type="button" className="small outline" onClick={() => void loadCatalog()}>다시 시도</button></p>}
        {missionCategoryNames.filter((category) => catalog.some((mission) => mission.category === category)).map((category) => <section className="mission-category" key={category} aria-label={category}><h4>{category} <span>{catalog.filter((mission) => mission.category === category).length}개</span></h4><div className="mission-grid">{catalog.filter((mission) => mission.category === category).map((m) => <CheckboxRow key={m.missionId} checked={missionIds.includes(m.missionId)} disabled={missionIds.length >= 3 && !missionIds.includes(m.missionId)} onChange={(checked) => { setMissionIds((old) => checked ? [...old,m.missionId] : old.filter((id) => id !== m.missionId)); markChanged(); }}>{m.text}</CheckboxRow>)}</div></section>)}
        {missionIds.length >= 3 && <p className="field-help">세 개를 골랐어요. 다른 미션을 선택하려면 먼저 하나를 해제해 주세요.</p>}
        <div className="custom-mission-form"><h4>우리 반 미션 추가</h4><p className="field-help">학교에서 돈 없이 안전하게 할 수 있는 행동을 적어 주세요. 외모·성적·신체 접촉·구매·개인정보 질문은 제외해 주세요.</p><label>새 미션 내용<input maxLength={100} value={customMission} onChange={(event) => setCustomMission(event.target.value)} placeholder="예: 친구의 의견을 끝까지 들어주기" /></label><button type="button" className="outline" disabled={busy || !customMission.trim()} onClick={() => void addCustomMission()}>미션 추가</button></div></>}
      {step === 4 && <><h3>4. 쪽지</h3><p>학생은 배정된 친구에게 쪽지를 보내고, 받은 쪽지에는 익명으로 답장할 수 있어요.</p><div className="review-card"><strong>바로 전달</strong><p>준비된 문구와 직접 쓴 쪽지가 선생님 승인 없이 전달돼요. 학생끼리는 발신자 이름이 보이지 않고, 선생님은 안전 확인에서 대화를 보고 문제가 있는 쪽지를 숨길 수 있어요.</p><p className="field-help">수업일마다 학생 한 명이 최대 10건, 한 건에 200자까지 보낼 수 있어요. 학생은 받은 쪽지를 숨기거나 선생님께 알릴 수 있어요.</p></div></>}
      {step === 5 && <><h3>5. 준비 내용 확인</h3><p>여기서 저장하면 시즌 초안이 만들어져요. 시작은 조건 확인 뒤 별도로 진행합니다.</p>
        <dl className="review-summary"><div><dt>주제</dt><dd>{title}</dd></div><div><dt>기간</dt><dd>{start} ~ {end}</dd></div><div><dt>활동일</dt><dd>평일 {selectedDates.length}일</dd></div><div><dt>참가자</dt><dd>{participants.length}명</dd></div><div><dt>필수 제외</dt><dd>{excludedPairs.length}쌍</dd></div><div><dt>미션</dt><dd>{missionIds.map((id) => catalog.find((mission) => mission.missionId === id)?.text ?? "미션 확인 필요").join(" · ")}</dd></div><div><dt>쪽지</dt><dd>자유 입력·익명 답장 즉시 전달 · 교사 모니터링</dd></div></dl></>}
      {stepError && <p id="round-step-error" className="field-error" role="alert">{stepError}</p>}
      <div className="action-row">{step > 1 && <button type="button" className="outline" onClick={() => { setStep((value) => value - 1); setError(""); setStepError(""); }}>이전</button>}
        {step < 5 ? <button type="button" onClick={(event) => {event.preventDefault(); nextStep();}}>다음</button> : <button type="submit" disabled={busy || catalogError}>{busy ? "저장 중…" : "준비 내용 저장"}</button>}</div>
    </form>}

    {view === "rounds" && current && !creating && <div className="stack"><p><strong>{current.title}</strong> · {roundStatusLabels[current.status] ?? current.status} · {current.participantCount}명</p>
      <p className="field-help">{koreaDay(new Date(current.startsAt))} ~ {koreaDay(new Date(current.endsAt))} · 수업일 {current.activityDates.length}일</p>
      {["draft","ready"].includes(current.status) && <button className="outline" onClick={() => setCreating(true)}>준비 내용 수정</button>}
      <div className="action-row">
        {current.status === "draft" && <button disabled={busy} onClick={() => void action("prepare")}>조건 확인</button>}
        {current.status === "ready" && <button disabled={busy} onClick={() => askAction("start")}>매칭하고 시작</button>}
        {current.status === "active" && <><button disabled={busy} onClick={() => void action("pause")}>일시정지</button><button className="danger" disabled={busy} onClick={() => askAction("end")}>활동 종료</button></>}
        {current.status === "paused" && <><button disabled={busy} onClick={() => void action("resume")}>재개</button><button className="danger" disabled={busy} onClick={() => askAction("end")}>활동 종료</button></>}
        {current.status === "reveal_pending" && <button disabled={busy} onClick={() => askAction("reveal")}>정체 공개 승인</button>}
        {["revealed", "cancelled"].includes(current.status) && <button disabled={busy} onClick={() => void action("archive")}>보관하고 다음 시즌 준비</button>}
        {["draft", "ready", "active", "paused"].includes(current.status) && <button className="danger" disabled={busy} onClick={() => askAction("cancel")}>시즌 취소</button>}
      </div>
      {current.status === "paused" && <div className="review-card stack"><h3>일시정지 중 기간 연장</h3><label>새 종료일<input type="date" min={koreaDay(new Date(current.endsAt))} value={end} onChange={(e) => setEnd(e.target.value)} /></label><label>변경한 수업일 3~20일<textarea rows={2} value={dates} onChange={(e) => setDates(e.target.value)} /></label><button disabled={busy} onClick={() => void run(async () => { await call<object, object>("extendRound", {classId,roundId:current.roundId, endsAt:endOfKoreaDay(end), activityDates:dates.split(/[\s,]+/).filter(Boolean),requestId:crypto.randomUUID()}); setNotice("기간을 연장했어요."); })}>기간 연장</button></div>}
      {current.status === "reveal_pending" && summary && (summary.helpCount + summary.pendingMessageCount > 0) && <p className="message error">도움 요청 {summary.helpCount}건과 검토할 쪽지 {summary.pendingMessageCount}건을 처리한 뒤 공개해 주세요. <button className="small outline" onClick={() => onNavigate("safety")}>안전 확인으로</button></p>}
      {["active", "paused", "reveal_pending", "revealed"].includes(current.status) && <><button className="small outline" disabled={busy} onClick={() => { if (assignments) { assignmentRequest.current++; setAssignments(null); return; } const version = ++assignmentRequest.current; void run(async () => { const result = await call<object, {assignments: Assignment[]}>("getAssignmentsForTeacher", {classId, roundId: current.roundId}); if (version === assignmentRequest.current && document.visibilityState === "visible") setAssignments(result.assignments); }); }}>{assignments ? "배정표 가리기" : "안전 대응용 배정표 열람"}</button>{assignments && <table><thead><tr><th>챙기는 학생</th><th>챙겨 줄 친구</th></tr></thead><tbody>{assignments.map((a) => <tr key={a.giverUid}><td>{a.giverName}</td><td>{a.receiverName}</td></tr>)}</tbody></table>}</>}
    </div>}

    {view === "safety" && <div className="stack">
      {!current ? <p>진행 중인 활동이 없어요. 지난 시즌는 시즌 목록에서 확인해 주세요.</p> : <><p><strong>{current.title}</strong> · {roundStatusLabels[current.status] ?? current.status}</p>
        <button className="small outline" disabled={busy} onClick={() => void loadOverview(current.roundId).catch(() => setOverviewError(true))}>안전 목록 새로고침</button>
        {overviewError && <p className="message error" role="alert">목록을 불러오지 못했어요. 다시 시도해 주세요.</p>}
        {!overview && !overviewError && <p>안전 목록을 불러오는 중이에요…</p>}
        {overview && <><h3>도움 요청 · {overview.helps.length}건</h3>{overview.helps.length === 0 ? <p>대기 중인 요청이 없어요.</p> : overview.helps.map((h) => <div className="review-card" key={h.helpId}><strong>{h.studentName} · {helpCategoryLabels[h.category] ?? h.category}</strong><button className="small outline" onClick={() => {setOpenHelpId((old) => old === h.helpId ? null : h.helpId); setOpenReviewMessageId(null); setSafetyMessages({});}}>{openHelpId === h.helpId ? "내용 닫기" : "내용 확인"}</button>{openHelpId === h.helpId && <><p>{h.note}</p>
          {h.messageId && <><button className="small outline" disabled={busy} onClick={() => safetyMessages[h.messageId!] ? setSafetyMessages((old) => { const next = {...old}; delete next[h.messageId!]; return next; }) : void inspectMessage(h.messageId!)}>{safetyMessages[h.messageId] ? "원문 닫기" : "신고 쪽지 원문 확인"}</button>
            {safetyMessages[h.messageId] && <p className="safety-secret">발신 {safetyMessages[h.messageId].senderName} → 수신 {safetyMessages[h.messageId].receiverName}: {safetyMessages[h.messageId].text}</p>}</>}
          <label>처리 내용<input value={resolution[h.helpId] ?? ""} onChange={(e) => setResolution((old) => ({...old, [h.helpId]: e.target.value}))} /></label><button disabled={busy || !resolution[h.helpId]?.trim()} onClick={() => void resolve(h.helpId)}>처리 완료</button></>}</div>)}
          <h3>검토할 쪽지 · {overview.pendingMessages.length}건</h3>{overview.pendingMessages.length === 0 ? <p>대기 중인 쪽지가 없어요.</p> : overview.pendingMessages.map((m,index) => <div className="review-card" key={m.messageId}><strong>검토할 쪽지 {index + 1}</strong><button className="small outline" onClick={() => {setOpenReviewMessageId((old) => old === m.messageId ? null : m.messageId); setOpenHelpId(null); setSafetyMessages({});}}>{openReviewMessageId === m.messageId ? "원문 닫기" : "원문 확인"}</button>{openReviewMessageId === m.messageId && <><p>{m.senderName} → {m.receiverName}</p><p>{m.text}</p><button disabled={busy} onClick={() => void review(m.messageId, "approve")}>승인</button><button className="outline" disabled={busy} onClick={() => void review(m.messageId, "reject")}>반려</button></>}</div>)}
          <div className="section-heading"><h3>쪽지 대화 모니터링</h3><button className="small outline" type="button" onClick={() => void loadMonitoredMessages(current.roundId)}>최근 쪽지 새로고침</button></div>
          <p className="field-help">배정된 친구 사이의 쪽지와 답장을 최신순으로 확인해요. 원문은 열 때마다 열람 기록이 남습니다.</p>
          {messageListError && <p className="message error" role="alert">쪽지 목록을 불러오지 못했어요. 새로고침을 눌러 다시 시도해 주세요.</p>}
          {monitoredMessages.length === 0 && !messageListError ? <p>아직 주고받은 쪽지가 없어요.</p> : <div className="monitored-list">{monitoredMessages.map((item) => <div className="review-card" key={item.messageId}><div className="monitored-heading"><strong>{item.senderName} → {item.receiverName}</strong><span>{item.date} · {item.replyToMessageId ? "답장" : "첫 쪽지"} · {item.status === "moderated" ? "교사가 숨김" : item.status === "pending" ? "이전 방식 검토 대기" : "전달됨"}</span></div><div className="action-row"><button type="button" className="small outline" disabled={busy} onClick={() => safetyMessages[item.messageId] ? setSafetyMessages((old) => {const next={...old}; delete next[item.messageId]; return next;}) : void inspectMessage(item.messageId)}>{safetyMessages[item.messageId] ? "원문 가리기" : "원문 확인"}</button>{item.status === "delivered" && <button type="button" className="small danger" disabled={busy} onClick={() => setModerationTarget(item.messageId)}>학생 화면에서 숨기기</button>}</div>{safetyMessages[item.messageId] && <p className="safety-secret">{safetyMessages[item.messageId].text}</p>}</div>)}</div>}
          {messageCursor && <button type="button" className="outline" disabled={busy} onClick={() => void loadMonitoredMessages(current.roundId, messageCursor)}>이전 쪽지 더 보기</button>}
          <h3>접속·활동 지원</h3><p className="field-help">학생별 지원을 위한 비공개 정보예요. 점수나 순위로 사용하지 마세요.</p><ul className="member-list">{overview.participation.map((p) => <li key={p.studentUid}><span>{p.displayName} · {participationLabels[p.status] ?? p.status}<small>{p.accessStatus === "active" ? "입장 가능" : "입장 제한"} · {p.lastLoginAt ? `최근 입장 ${new Date(p.lastLoginAt).toLocaleDateString("ko-KR")}` : "입장 기록 없음"} · {p.hasActivity ? "활동 기록 있음" : "활동 기록 없음"}</small></span>{p.status === "active" && ["active", "paused", "reveal_pending"].includes(current.status) && <button className="small outline" disabled={busy} onClick={() => askAction("stop", p.studentUid)}>참여 중단</button>}</li>)}</ul></>}
      </>}
    </div>}

    {view === "history" && <div className="round-list">{rounds.filter((r) => ["revealed","archived","cancelled"].includes(r.status)).length === 0 ? <p>지난 활동이 없어요.</p> : rounds.filter((r) => ["revealed","archived","cancelled"].includes(r.status)).map((round) => <button key={round.roundId} onClick={() => chooseRound(round.roundId)}><strong>{round.title}</strong><small>{roundStatusLabels[round.status]} · {koreaDay(new Date(round.startsAt))} ~ {koreaDay(new Date(round.endsAt))}</small></button>)}
      {current && ["revealed","archived","cancelled"].includes(current.status) && <div className="review-card"><h3>{current.title} · {roundStatusLabels[current.status]}</h3><p>주제·참가자·미션·쪽지 설정만 다음 시즌에 복사합니다. 이전 배정과 활동 기록은 복사하지 않아요.</p><label>다음 시즌 주제<input value={nextTitle} onChange={(e) => setNextTitle(e.target.value)} maxLength={60} /></label><button disabled={busy || !nextTitle.trim()} onClick={() => void copySettings()}>설정 복사해 새 시즌 준비</button></div>}</div>}
    {confirmation && <ConfirmDialog title={confirmation.title} detail={confirmation.detail} confirmLabel={confirmation.button} busy={busy} onCancel={() => setConfirmAction(null)} onConfirm={confirmedAction} />}
    {moderationTarget && <ConfirmDialog title="이 쪽지를 학생 화면에서 숨길까요?" detail="받은 학생의 화면에서 숨기고 답장을 막습니다. 교사는 안전 기록을 계속 확인할 수 있어요." confirmLabel="쪽지 숨기기" busy={busy} onCancel={() => setModerationTarget(null)} onConfirm={() => {const id=moderationTarget; setModerationTarget(null); void hideForClass(id);}} />}
  </section>;
}
