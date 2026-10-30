import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTeacherMailContent, teacherMailText } from "../lib/classes/teacherMailValidation.js";

const invalid = (work) => assert.throws(work, (error) => error.code === "invalid-argument");

test("letters preserve paragraphs and accept an omitted subject", () => {
  const content = parseTeacherMailContent({ kind: "letter", letter: { body: "  첫째 줄\r\n\r\n둘째 줄  " } });
  assert.deepEqual(content, { kind: "letter", letter: { subject: "", body: "첫째 줄\n\n둘째 줄" } });
  assert.equal(parseTeacherMailContent({ kind: "letter", letter: { body: "가".repeat(4000) } }).letter.body.length, 4000);
  invalid(() => parseTeacherMailContent({ kind: "letter", letter: { body: "가".repeat(4001) } }));
  invalid(() => parseTeacherMailContent({ kind: "letter", letter: { body: " \n " } }));
  invalid(() => parseTeacherMailContent({ kind: "letter", letter: { subject: "가".repeat(81), body: "내용" } }));
});

test("incident narrative is sufficient without inventing unknown names, reasons or dates", () => {
  const content = parseTeacherMailContent({ kind: "report", report: { incident: "어떤 일이 있었어요.\n도움을 받고 싶어요." } });
  assert.equal(content.report.incident, "어떤 일이 있었어요.\n도움을 받고 싶어요.");
  assert.deepEqual(content.report.relatedStudents, []);
  assert.deepEqual(content.report.witnesses, []);
  for (const field of ["occurredAt", "location", "reason", "feelings", "desiredAction", "neededHelp"]) {
    assert.equal(content.report[field], "");
  }
  invalid(() => parseTeacherMailContent({ kind: "report", report: { incident: "" } }));
});

test("long incident narratives and forty people are supported within the documented bounds", () => {
  const report = {
    incident: "일".repeat(6000), relatedStudents: Array.from({ length: 40 }, (_, i) => `가상친구${i}`),
    witnesses: Array.from({ length: 40 }, (_, i) => ({ name: `목격친구${i}`, otherClass: true, className: "3학년 2반" })),
    occurredAt: "언".repeat(200), location: "곳".repeat(200),
    reason: "왜".repeat(1000), feelings: "감".repeat(1000), desiredAction: "조".repeat(1000), neededHelp: "도".repeat(1000),
  };
  assert.equal(parseTeacherMailContent({ kind: "report", report }).report.relatedStudents.length, 40);
  assert.equal(parseTeacherMailContent({ kind: "report", report }).report.witnesses.length, 40);
  invalid(() => parseTeacherMailContent({ kind: "report", report: { ...report, incident: "일".repeat(6001) } }));
  invalid(() => parseTeacherMailContent({ kind: "report", report: { ...report, relatedStudents: [...report.relatedStudents, "추가"] } }));
  invalid(() => parseTeacherMailContent({ kind: "report", report: { ...report, witnesses: [...report.witnesses, report.witnesses[0]] } }));
  invalid(() => parseTeacherMailContent({ kind: "report", report: { ...report, reason: "왜".repeat(1001) } }));
});

test("other-class witnesses need a class while same-class witnesses need no redundant class input", () => {
  const parse = (witnesses) => parseTeacherMailContent({ kind: "report", report: { incident: "일어난 일", witnesses } });
  assert.deepEqual(parse([{ name: "가상친구", otherClass: false }]).report.witnesses, [{ name: "가상친구", otherClass: false }]);
  assert.equal(parse([{ name: "가상친구", otherClass: true, className: "  4반  " }]).report.witnesses[0].className, "4반");
  invalid(() => parse([{ name: "가상친구", otherClass: true }]));
  invalid(() => parse([{ name: "가상친구", otherClass: true, className: "  " }]));
  invalid(() => parse([{ name: "", otherClass: false }]));
  invalid(() => parse([{ name: "가상친구", otherClass: "yes" }]));
});

test("content uses one valid branch and cannot carry an arbitrary sender or recipient into storage", () => {
  const content = parseTeacherMailContent({ kind: "letter", studentUid: "spoofed", recipientUid: "spoofed",
    letter: { body: "정상 편지", studentUid: "spoofed", recipientUid: "spoofed" } });
  assert.deepEqual(content, { kind: "letter", letter: { subject: "", body: "정상 편지" } });
  invalid(() => parseTeacherMailContent({ kind: "chat", text: "임의 대화" }));
  invalid(() => parseTeacherMailContent({ kind: "letter", letter: { body: "편지" }, report: { incident: "신고" } }));
  invalid(() => parseTeacherMailContent({ kind: "report", report: { incident: "신고" }, letter: { body: "편지" } }));
});

test("text is normalized without flattening paragraphs and invalid types or null bytes are rejected", () => {
  assert.equal(teacherMailText("가\n나", "내용", 10, true), "가\n나");
  invalid(() => teacherMailText(123, "내용", 10));
  invalid(() => teacherMailText("가\u0000나", "내용", 10));
  invalid(() => parseTeacherMailContent({ kind: "report", report: { incident: "내용", relatedStudents: "가상친구" } }));
});
