import { HttpsError } from "firebase-functions/v2/https";
import { requireRecord } from "../shared/validation.js";

export type TeacherMailKind = "letter" | "report";
export type TeacherMailStatus = "received" | "resolved";
export type TeacherMailWitness = { name: string; otherClass: boolean; className?: string };
export type TeacherMailLetter = { subject: string; body: string };
export type TeacherMailReport = {
  relatedStudents: string[];
  occurredAt: string;
  location: string;
  incident: string;
  reason: string;
  witnesses: TeacherMailWitness[];
  feelings: string;
  desiredAction: string;
  neededHelp: string;
};
export type TeacherMailContent =
  | { kind: "letter"; letter: TeacherMailLetter }
  | { kind: "report"; report: TeacherMailReport };

// Unlike short mission notes, letters and incident descriptions retain paragraphs.
export function teacherMailText(value: unknown, label: string, maxLength: number, required = false): string {
  if ((value === undefined || value === "") && !required) return "";
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${label}을(를) 입력해 주세요.`);
  }
  const text = value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
  if ((required && text.length === 0) || text.length > maxLength || text.includes("\u0000")) {
    throw new HttpsError("invalid-argument", `${label}은(는) ${required ? "1자 이상 " : ""}${maxLength}자 이내로 입력해 주세요.`);
  }
  return text;
}

function people(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 40) {
    throw new HttpsError("invalid-argument", "관련 학생은 40명 이내로 입력해 주세요.");
  }
  return value.map((name) => teacherMailText(name, "관련 학생 이름", 80, true));
}

function witnesses(value: unknown): TeacherMailWitness[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 40) {
    throw new HttpsError("invalid-argument", "목격 학생은 40명 이내로 입력해 주세요.");
  }
  return value.map((item) => {
    const person = requireRecord(item);
    if (typeof person.otherClass !== "boolean") {
      throw new HttpsError("invalid-argument", "목격 학생이 다른 반인지 선택해 주세요.");
    }
    const name = teacherMailText(person.name, "목격 학생 이름", 80, true);
    const className = teacherMailText(person.className, "목격 학생의 반", 80, person.otherClass);
    return { name, otherClass: person.otherClass, ...(className ? { className } : {}) };
  });
}

export function parseTeacherMailContent(value: unknown): TeacherMailContent {
  const input = requireRecord(value);
  if (input.kind === "letter") {
    if (input.report !== undefined) throw new HttpsError("invalid-argument", "편지와 신고는 따로 보내 주세요.");
    const letter = requireRecord(input.letter);
    return { kind: "letter", letter: {
      subject: teacherMailText(letter.subject, "편지 제목", 80),
      body: teacherMailText(letter.body, "편지 내용", 4000, true),
    } };
  }
  if (input.kind === "report") {
    if (input.letter !== undefined) throw new HttpsError("invalid-argument", "편지와 신고는 따로 보내 주세요.");
    const report = requireRecord(input.report);
    return { kind: "report", report: {
      relatedStudents: people(report.relatedStudents),
      occurredAt: teacherMailText(report.occurredAt, "언제 일어났는지", 200),
      location: teacherMailText(report.location, "어디에서 일어났는지", 200),
      incident: teacherMailText(report.incident, "일어난 일", 6000, true),
      reason: teacherMailText(report.reason, "알고 있는 이유", 1000),
      witnesses: witnesses(report.witnesses),
      feelings: teacherMailText(report.feelings, "현재 감정", 1000),
      desiredAction: teacherMailText(report.desiredAction, "원하는 조치", 1000),
      neededHelp: teacherMailText(report.neededHelp, "필요한 도움", 1000),
    } };
  }
  throw new HttpsError("invalid-argument", "편지 보내기 또는 신고하기를 선택해 주세요.");
}
