export type TeacherMailKind = "letter" | "report";
export type TeacherMailStatus = "received" | "resolved";
export type TeacherMailWitness = { name: string; otherClass: boolean; className?: string };
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
export type TeacherMailLetter = { subject: string; body: string };
export type CreateTeacherMailInput = { requestId: string } & (
  { kind: "letter"; letter: TeacherMailLetter; report?: never }
  | { kind: "report"; report: TeacherMailReport; letter?: never }
);
export type TeacherMailReceipt = {
  mailId: string;
  kind: TeacherMailKind;
  status: TeacherMailStatus;
  createdAt: string;
  resolvedAt?: string | null;
};
export type TeacherMailSummary = TeacherMailReceipt & { studentName: string };
export type TeacherMailDetail = TeacherMailSummary & {
  letter?: TeacherMailLetter;
  report?: TeacherMailReport;
  resolution?: string;
};
export type TeacherMailPage<T> = { items: T[]; nextCursor: string | null };
export type CreateTeacherMailResult = { mailId: string; status: "received" };
