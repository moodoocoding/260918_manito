export type TeacherPage = "classes" | "services" | "overview" | "mailbox" | "students" | "rounds" | "assignments" | "status" | "history" | "settings" | "today-tasks" | "class-board";
export type TeacherMenuEntry = { id: TeacherPage; label: string };
// Enable after the five teacher-mail callables and their safety dependencies are deployed and verified.
export const teacherMailServerReady = false;
type TeacherService = {
  id: string;
  title: string;
  status: string;
  description: string;
  page: TeacherPage;
  operational: boolean;
  action: string;
  menu: TeacherMenuEntry[];
  connection?: { studentFeatures: string[]; missingManagement: string[] };
};

export const teacherCorePages: TeacherMenuEntry[] = [
  { id: "classes", label: "학급 목록·개설" },
  { id: "students", label: "학생·입장 카드" },
  { id: "settings", label: "학급 정보·코드" },
];

export const teacherServiceCatalog: TeacherService[] = [
  {
    id: "manitto", title: "우리 반 마니또", status: "운영 가능", operational: true,
    description: "시즌 준비, 매칭, 학생 도움과 쪽지 확인, 공개와 지난 활동을 관리해요.",
    page: "overview", action: "마니또 운영 열기",
    menu: [
      { id: "overview", label: "운영 요약" }, { id: "rounds", label: "시즌 설정" },
      { id: "assignments", label: "배정 확인" }, { id: "status", label: "상태 확인" },
      { id: "history", label: "지난 활동" },
    ],
  },
  {
    id: "teacher-mailbox", title: "비밀 우체통",
    status: teacherMailServerReady ? "운영 가능" : "서버 연결 준비 중", operational: teacherMailServerReady,
    description: teacherMailServerReady ? "학생이 보낸 편지와 신고를 확인하고 처리해요." : "편지·신고 화면은 준비됐어요. 실제 접수와 조회를 위한 서버 연결이 남아 있어요.",
    page: "mailbox", action: teacherMailServerReady ? "우체통 열기" : "연결 상태 보기",
    menu: [{ id: "mailbox", label: teacherMailServerReady ? "편지·신고함" : "우체통 연결 상태" }],
    connection: {
      studentFeatures: ["교사에게 편지 쓰기 화면 구현 · 접수 준비 중", "단계별 사건 신고 화면 구현 · 접수 준비 중"],
      missingManagement: ["편지·신고 접수와 교사 조회 서버 연결", "처리 기록과 미처리 신고의 공개 차단 연동"],
    },
  },
  {
    id: "today-tasks", title: "오늘 할 일", status: "교사 관리 연결 필요", operational: false,
    description: "학생용 과제 화면은 제공돼요. 과제 등록·수정은 아직 이 선생님 방에 연결되지 않았어요.",
    page: "today-tasks", action: "연결 상태 보기", menu: [{ id: "today-tasks", label: "과제 연결 상태" }],
    connection: {
      studentFeatures: ["학생의 과제 조회와 완료·취소", "기존 Schooldoc 과제 연결"],
      missingManagement: ["이 선생님 방에서 과제 등록·수정", "학급별 과제 연결 설정과 교사 확인"],
    },
  },
  {
    id: "class-board", title: "우리 반 게시판 · 자리바꾸기", status: "교사 관리 연결 필요", operational: false,
    description: "학생 활동 화면은 제공돼요. 게시판과 자리바꾸기의 교사 운영 설정은 아직 연결되지 않았어요.",
    page: "class-board", action: "연결 상태 보기", menu: [{ id: "class-board", label: "게시판·자리 연결 상태" }],
    connection: {
      studentFeatures: ["우리 반 게시판의 학생 활동 화면", "학급 단위 자리바꾸기 질문과 참여"],
      missingManagement: ["교사용 게시판 운영 설정", "자리바꾸기 새 활동 준비와 명부 변경 후 다시 준비"],
    },
  },
];

export const teacherPages: TeacherMenuEntry[] = [
  ...teacherCorePages, { id: "services", label: "서비스 모음" },
  ...teacherServiceCatalog.flatMap((service) => service.menu),
];
export const teacherNavigationGroups = [
  { label: "학급 공통 관리", pages: teacherCorePages },
  { label: "학급 서비스", pages: [{ id: "services" as const, label: "서비스 모음" }] },
  ...teacherServiceCatalog.map((service) => ({ label: service.title, pages: service.menu })),
];

export function teacherLocation(path: string): { classId: string | null; page: TeacherPage } {
  const parts = path.split("/").filter(Boolean);
  const classId = parts[0] === "teacher" && parts[1] === "classes" && parts[2] ? parts[2] : null;
  const page = parts[3] === "safety" ? "status" : parts[3];
  return { classId, page: classId ? teacherPages.find((item) => item.id === page)?.id ?? "services" : "classes" };
}

/** Only the initial sign-in/restore may skip a redundant one-class picker. */
export function teacherLanding(path: string, classIds: readonly string[]): ReturnType<typeof teacherLocation> {
  const location = teacherLocation(path);
  if (location.classId || classIds.length !== 1) return location;
  return { classId: classIds[0], page: "services" };
}
