import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { StudentClassroom } from "../src/StudentClassroom";
import { APP_NAME } from "../src/appIdentity";
import { WorldPageFrame, WorldPageHeader, WorldPaper } from "../src/WorldPage";
import { StudentCommunity } from "../src/StudentCommunity";
import { StudentExpansionSpace } from "../src/StudentExpansionSpace";
import { StudentTodayTasks } from "../src/StudentTodayTasks";
import { createTodayTasksPreviewClient } from "./today-tasks-fixture";
import { StudentTeacherMailbox, emptyTeacherMailboxDraft, isTeacherMailboxDraftDirty, type TeacherMailboxDraft } from "../src/StudentTeacherMailbox";
import { expansionSpaces, isExpansionSpaceId, type ExpansionSpaceId } from "../src/expansionSpaces";
import "../src/style.css";
import "../src/student-world.css";
import "../src/student-manitto.css";
import "../src/student-teacher-mailbox.css";

const pageNames = { "today-tasks": "오늘 할 일", manitto: "마니또", "manitto-missions": "마니또 · 미션", "manitto-friend-mail": "마니또 · 친구 쪽지", "manitto-help": "마니또 · 도움", "manitto-history": "마니또 · 지난 활동", mail: "비밀 우체통", community: "우리 반 게시판" };
type ManittoPreviewPage = "manitto" | "manitto-missions" | "manitto-friend-mail" | "manitto-help" | "manitto-history";
type PreviewPage = keyof typeof pageNames | ExpansionSpaceId;
const pageName = (page: PreviewPage) => isExpansionSpaceId(page) ? expansionSpaces[page].title : pageNames[page];

function readPage(): PreviewPage | null {
  const page = new URLSearchParams(window.location.search).get("place");
  if (page === "space-1" || page === "missions") return "manitto";
  return page === "today-tasks" || page === "manitto" || page === "manitto-missions" || page === "manitto-friend-mail" || page === "manitto-help" || page === "manitto-history" || page === "mail" || page === "community" || isExpansionSpaceId(page) ? page : null;
}

function ManittoPreviewPage({ page, onBack, onNavigate }: { page: ManittoPreviewPage; onBack: () => void; onNavigate: (page: ManittoPreviewPage) => void }) {
  const [selectedMission, setSelectedMission] = useState<string | null>(null);
  const longFixture = new URLSearchParams(window.location.search).get("fixture") === "long";
  const missionTexts = longFixture
    ? Array.from({length: 80}, (_, index) => `${index + 1}. 친구가 준비물을 찾기 어려워할 때 함께 살펴보고, 친구가 괜찮다고 하면 차분히 도와주기`)
    : ["먼저 반갑게 인사하기", "친구의 이야기를 끝까지 들어 주기", "함께 쓰는 책상 정리하기"];
  const items: Array<{id: ManittoPreviewPage; label: string}> = [
    {id:"manitto",label:"활동 홈"},{id:"manitto-missions",label:"미션"},{id:"manitto-friend-mail",label:"친구 쪽지"},{id:"manitto-help",label:"도움"},{id:"manitto-history",label:"지난 활동"},
  ];
  const section = page === "manitto" ? "home" : page === "manitto-missions" ? "missions" : page === "manitto-friend-mail" ? "mail" : page === "manitto-help" ? "help" : "history";
  return <WorldPageFrame ariaLabel="마니또">
    <WorldPageHeader title={pageNames[page]} icon={section === "mail" ? "envelope" : section === "history" ? "book" : "sprout"} onBack={onBack} onExit={onBack} />
    <WorldPaper>
      <nav className="student-nav manitto-student-nav segmented-track" aria-label="마니또 메뉴">{items.map((item) =>
        <button type="button" key={item.id} aria-current={page === item.id ? "page" : undefined} onClick={() => onNavigate(item.id)}>{item.label}</button>)}</nav>
      <div className="world-state" role="note">가상 활동 예시 · 실제 학생 기록이나 쪽지를 불러오지 않아요.</div>
      {section === "home" && <>
        <section className="world-section"><span className="world-state">오늘 해볼 미션</span><h2>친구의 이야기를 끝까지 들어 주기</h2><p>친구가 이야기할 때 끼어들지 않고 들어 봐요.</p><button type="button" className="world-button world-button--primary" onClick={() => onNavigate("manitto-missions")}>미션 살펴보기</button></section>
        <section className="world-section"><span className="world-state">활동 중 · 예시</span><h2>{longFixture ? "2026학년도 5학년 3반과 함께하는 따뜻한 마음 나누기 활동 주간" : "마음 나누기 주간"}</h2><p>내 미션 2개를 골랐어요. 친구 이름은 선생님이 공개한 뒤에 확인할 수 있어요.</p></section>
      </>}
      {section === "missions" && <section className="world-section"><h2>미션 골라보기</h2>{missionTexts.map((text) => <article className="world-section" key={text}><strong>{text}</strong><button type="button" className="world-button world-button--secondary" aria-pressed={selectedMission === text} onClick={() => setSelectedMission(text)}>{selectedMission === text ? "이번에 해볼 미션으로 골랐어요" : "이번에 해볼래요"}</button></article>)}</section>}
      {section === "mail" && <section className="world-section"><h2>친구 쪽지</h2><div className="world-section"><p>비밀친구</p><p>오늘 같이 정리해 줘서 고마워!</p></div><p>활동 중 이름은 비밀로 지켜져요. 받은 쪽지에 답장할 수 있어요.</p></section>}
      {section === "help" && <section className="world-section"><h2>선생님께 도움 요청</h2><p>불편하거나 걱정되는 일이 있으면 비공개로 알려 주세요. 공개되거나 감점되지 않아요.</p><p className="field-help">실제 도움 요청은 학생 카드 로그인 뒤에 저장돼요.</p></section>}
      {section === "history" && <section className="world-section"><h2>지난 활동</h2><p>예전 활동이 공개되면 미션·쪽지·회고를 살펴볼 수 있어요.</p><article className="world-section"><strong>마음 나누기 주간</strong><span className="world-state">회고와 기록 예시</span></article></section>}
    </WorldPaper>
  </WorldPageFrame>;
}

function DestinationPage({ page, onBack, onNavigate }: { page: Exclude<PreviewPage, "mail" | "today-tasks">; onBack: () => void; onNavigate: (page: PreviewPage) => void }) {
  if (isExpansionSpaceId(page)) return <StudentExpansionSpace spaceId={page} onBack={onBack} preview />;
  if (page === "community") return <StudentCommunity roundId="preview" preview showBalanceGameEntry onBack={onBack} onExit={onBack} classLabel="예시 학급" />;
  return <ManittoPreviewPage page={page as ManittoPreviewPage} onBack={onBack} onNavigate={(next) => onNavigate(next)} />;
}

function WorldPreview() {
  const longClassName = new URLSearchParams(window.location.search).get("class") === "long";
  const [page, setPage] = useState<PreviewPage | null>(readPage);
  const mailboxDraft = useRef<TeacherMailboxDraft>(emptyTeacherMailboxDraft());
  const mailboxBusy = useRef(false);
  const [tasksClient] = useState(() => createTodayTasksPreviewClient(new URLSearchParams(window.location.search).get("tasks") || "default"));
  const initialPage = readPage();
  const worldPosition = useRef(initialPage && isExpansionSpaceId(initialPage) ? expansionSpaces[initialPage].x
    : initialPage && initialPage.startsWith("manitto") ? expansionSpaces["space-1"].x
    : initialPage === "today-tasks" ? 16 : initialPage === "mail" ? 65 : new URLSearchParams(window.location.search).get("area") === "east" ? expansionSpaces["space-1"].x : 8);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("text") !== "200") return;
    const previous = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = "200%";
    return () => { document.documentElement.style.fontSize = previous; };
  }, []);

  function navigate(next: PreviewPage | null) {
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("place", next);
    else url.searchParams.delete("place");
    window.history.pushState(null, "", `${url.pathname}${url.search}`);
    setPage(next);
  }

  useEffect(() => {
    const onPop = () => {
      if (readPage() !== "mail" && (mailboxBusy.current || isTeacherMailboxDraftDirty(mailboxDraft.current))) {
        if (mailboxBusy.current || !window.confirm("아직 보내지 않은 편지나 신고가 있어요. 내용을 지우고 이동할까요?")) {
          const url = new URL(window.location.href);
          url.searchParams.set("place", "mail");
          window.history.pushState(null, "", `${url.pathname}${url.search}`);
          return;
        }
        mailboxDraft.current = emptyTeacherMailboxDraft();
      }
      setPage(readPage());
    };
    const warn = (event: BeforeUnloadEvent) => {
      if (mailboxBusy.current || isTeacherMailboxDraftDirty(mailboxDraft.current)) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("popstate", onPop); window.removeEventListener("beforeunload", warn); };
  }, []);

  useEffect(() => {
    document.title = page ? `${pageName(page)} · ${APP_NAME}` : `우리 반 월드 · ${APP_NAME}`;
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>(".student-page-title")?.focus();
  }, [page]);
  return <div className={`app-shell student-app world-theme ${page ? "world-feature-shell" : "classroom-app"}`}>
    <main className="content">
      {!page && <p className="field-help" style={{margin:"0 0 14px",color:"#244b4b"}}>화면 미리보기 · 예시 학급 정보만 표시해요.</p>}
      {page === "today-tasks" ? <StudentTodayTasks client={tasksClient} autoConnect authorize={async () => "예시 학생"} onBack={() => navigate(null)} onExit={() => navigate(null)}
        onHelp={() => window.alert("지금은 가상 화면이에요. 실제 학생 화면에서는 선생님 도움으로 이동해요.")} preview />
        : page === "mail" ? <StudentTeacherMailbox draftRef={mailboxDraft} preview
        onSubmit={async () => ({mailId: crypto.randomUUID(), status: "received"})} onBusyChange={(value) => { mailboxBusy.current = value; }}
        onBack={() => navigate(null)} onExit={() => { mailboxDraft.current = emptyTeacherMailboxDraft(); navigate(null); }} /> : page ? <DestinationPage page={page} onBack={() => navigate(null)} onNavigate={navigate} /> : <section className="student-grid student-shell">
        <StudentClassroom className={longClassName ? "예시 학급 · 함께 떠나는 2026학년도 5학년 3반 긴 이름 실험반" : "예시 학급 3학년 2반"} onNavigate={navigate}
          initialPosition={worldPosition.current} onPositionChange={(position) => { worldPosition.current = position; }} />
      </section>}
    </main>
  </div>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><WorldPreview /></StrictMode>);
