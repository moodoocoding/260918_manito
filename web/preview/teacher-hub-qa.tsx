import { Fragment, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { TeacherServiceConnection, TeacherServiceHub } from "../src/TeacherServiceHub";
import { StudentTeacherMailboxPending } from "../src/StudentTeacherMailbox";
import { teacherNavigationGroups, teacherPages, type TeacherPage } from "../src/teacherNavigation";
import { WorldButton, WorldPageFrame, WorldPageHeader, WorldPaper } from "../src/WorldPage";
import "../src/style.css";
import "../src/teacher-room.css";

function TeacherHubQa() {
  const [page, setPage] = useState<TeacherPage>("services");
  const [notice, setNotice] = useState("");
  const mobileMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("text") === "200") document.documentElement.style.fontSize = "200%";
  }, []);
  function open(next: TeacherPage) {
    setPage(next);
    setNotice(`이동 확인: ${teacherPages.find((item) => item.id === next)?.label}`);
    if (mobileMenu.current) mobileMenu.current.open = false;
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-teacher-page-title]")?.focus());
  }
  function menu() {
    return teacherNavigationGroups.map((group) => <Fragment key={group.label}>
      <span className="sidebar-label">{group.label}</span>
      {group.pages.map((entry) => <button key={entry.id} aria-current={entry.id === page ? "page" : undefined} onClick={() => open(entry.id)}>{entry.label}</button>)}
    </Fragment>);
  }
  if (new URLSearchParams(window.location.search).get("view") === "student-mail") {
    return <div className="app-shell world-feature-shell"><main className="content">
      <StudentTeacherMailboxPending onBack={() => setNotice("마을 복귀 callback 확인")} onExit={() => setNotice("활동 마치기 callback 확인")} />
      {notice && <p role="status">{notice}</p>}
    </main></div>;
  }
  return <div className="app-shell world-feature-shell teacher-world-shell"><main className="content">
    <WorldPageFrame className="teacher-world-page" ariaLabel="선생님 방 검증">
      <WorldPageHeader title="선생님 방" backLabel="학급 공통 관리" onBack={() => open("classes")} onExit={() => setNotice("활동 마치기 callback 확인 · 실제 인증 없음")} />
      <WorldPaper className="teacher-world-paper">
        <p className="teacher-preview-banner">화면 검증 전용 · 가상 학급이며 실제 로그인·학급 조회·저장을 하지 않아요.</p>
        {notice && <p role="status">{notice}</p>}
        <div className="teacher-shell">
          <nav className="teacher-sidebar" aria-label="선생님 방 메뉴">{menu()}</nav>
          <div className="teacher-main">
            <div className="teacher-context"><div><span className="context-badge">현재 선택 학급</span>
              <h2>5학년 3반 · 길게 입력한 학급 이름도 읽을 수 있는 확인용 학급</h2>
              <p>2026학년도 · 5~6학년 · 학생 40명</p>
            </div><WorldButton variant="secondary" onClick={() => open("classes")}>학급 바꾸기</WorldButton></div>
            <details ref={mobileMenu} className="mobile-teacher-menu"><summary>학급 메뉴 · {teacherPages.find((item) => item.id === page)?.label}</summary><nav aria-label="학급 메뉴">{menu()}</nav></details>
            {page === "services" ? <TeacherServiceHub onOpen={open} /> : page === "mailbox" || page === "today-tasks" || page === "class-board" ?
              <TeacherServiceConnection page={page} onOpen={open} /> :
              <section className="panel"><h2 data-teacher-page-title tabIndex={-1}>{teacherPages.find((item) => item.id === page)?.label}</h2>
                <p>실제 앱에서는 선택한 학급의 기존 관리 화면으로 이동해요. 이 검증 화면은 이동 callback만 확인해요.</p>
                <WorldButton onClick={() => open("services")}>서비스 모음으로</WorldButton>
              </section>}
          </div>
        </div>
      </WorldPaper>
    </WorldPageFrame>
  </main></div>;
}

createRoot(document.getElementById("root")!).render(<TeacherHubQa />);
