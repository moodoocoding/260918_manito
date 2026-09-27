import { HttpsError } from "firebase-functions/v2/https";
import { db } from "../shared/firebase.js";
import { assertClassTeacher } from "../shared/authorization.js";
import { requireDocumentId, requireRecord, requireText } from "../shared/validation.js";

export interface RoundSettings {
  participantIds: string[];
  excludedPairs: Array<{ a: string; b: string }>;
  activityDates: string[];
  missionIds: string[];
  rosterVersion: number;
}

export function koreaDate(date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

export function parseRoundInput(value: unknown): {
  title: string;
  startsAt: Date;
  endsAt: Date;
  activityDates: string[];
  participantIds: string[];
  excludedPairs: Array<[string, string]>;
  allowFreeTextMessages: boolean;
  missionIds: string[];
} {
  const input = requireRecord(value);
  const title = requireText(input.title, "회차 주제", 60);
  const startsAt = new Date(String(input.startsAt));
  const endsAt = new Date(String(input.endsAt));
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())
    || endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > 30 * 86400_000) {
    throw new HttpsError("invalid-argument", "회차 기간은 30일 이내로 정해 주세요.");
  }
  if (!Array.isArray(input.activityDates) || input.activityDates.length < 3 || input.activityDates.length > 20
    || input.activityDates.some((date) => typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    || input.activityDates.some((date) => !Number.isFinite(new Date(`${date}T00:00:00Z`).getTime())
      || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)
    || new Set(input.activityDates).size !== input.activityDates.length) {
    throw new HttpsError("invalid-argument", "서로 다른 수업일을 3~20일 선택해 주세요.");
  }
  const activityDates = [...input.activityDates].sort() as string[];
  if (activityDates[0] < koreaDate(startsAt) || activityDates.at(-1)! > koreaDate(endsAt)) {
    throw new HttpsError("invalid-argument", "수업일은 회차 기간 안에 있어야 해요.");
  }
  if (!Array.isArray(input.participantIds) || input.participantIds.length < 4
    || input.participantIds.length > 40) {
    throw new HttpsError("invalid-argument", "참가자는 4~40명이어야 해요.");
  }
  const participantIds = input.participantIds.map((id) => requireDocumentId(id, "학생"));
  if (new Set(participantIds).size !== participantIds.length) {
    throw new HttpsError("invalid-argument", "참가자가 중복됐어요.");
  }
  if (!Array.isArray(input.excludedPairs) || input.excludedPairs.length > 780) {
    throw new HttpsError("invalid-argument", "제외 관계 형식이 올바르지 않아요.");
  }
  const participants = new Set(participantIds);
  const excludedPairs = input.excludedPairs.map((pair) => {
    if (!Array.isArray(pair) || pair.length !== 2) {
      throw new HttpsError("invalid-argument", "제외 관계 형식이 올바르지 않아요.");
    }
    const a = requireDocumentId(pair[0], "학생");
    const b = requireDocumentId(pair[1], "학생");
    if (a === b || !participants.has(a) || !participants.has(b)) {
      throw new HttpsError("invalid-argument", "제외 관계는 서로 다른 참가자 두 명이어야 해요.");
    }
    return [a, b] as [string, string];
  });
  if (typeof input.allowFreeTextMessages !== "boolean") {
    throw new HttpsError("invalid-argument", "자유 쪽지 허용 여부를 정해 주세요.");
  }
  const missionIds = input.missionIds === undefined ? [] : input.missionIds;
  if (!Array.isArray(missionIds) || missionIds.length > 80
    || new Set(missionIds).size !== missionIds.length
    || missionIds.some((id) => typeof id !== "string" || !/^[A-Za-z0-9_-]{3,40}$/.test(id))) {
    throw new HttpsError("invalid-argument", "서로 다른 미션을 1~80개 선택해 주세요.");
  }
  return {
    title, startsAt, endsAt, activityDates, participantIds, excludedPairs,
    allowFreeTextMessages: input.allowFreeTextMessages, missionIds: missionIds as string[],
  };
}

export async function requireTeacherRound(teacherUid: string, classId: string, roundId: string) {
  const classRef = db.doc(`classes/${classId}`);
  const roundRef = classRef.collection("rounds").doc(roundId);
  const [classDoc, roundDoc] = await Promise.all([classRef.get(), roundRef.get()]);
  assertClassTeacher(classDoc.data(), teacherUid);
  if (!roundDoc.exists) throw new HttpsError("not-found", "회차를 찾지 못했어요.");
  return { classRef, roundRef, classDoc, roundDoc };
}
