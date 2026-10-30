import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { TeacherLogin } from "../src/TeacherLogin";
import { StudentLogin } from "../src/StudentLogin";
import { APP_NAME } from "../src/appIdentity";
import "../src/style.css";
import "../src/student-login.css";
import "../src/teacher-room.css";

// Component-only fixture: no Firebase imports, authentication or external writes.
function LoginPreview() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("text") !== "200") return;
    const previous = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = "200%";
    return () => { document.documentElement.style.fontSize = previous; };
  }, []);
  const [role, setRole] = useState<"teacher" | "student">("teacher");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [classCode, setClassCode] = useState("");
  const [cardCode, setCardCode] = useState("");
  const [remember, setRemember] = useState(false);
  const [showCard, setShowCard] = useState(false);
  return <div className={`app-shell ${role === "teacher" ? "teacher-entry-app" : "student-entry-app"}`}>
    <div className="topbar-surface"><header className="topbar"><strong className="brand">{APP_NAME}</strong>
      <nav className="service-switch" aria-label="미리보기 역할 선택">
        <button type="button" aria-pressed={role === "student"} className={role === "student" ? "nav-active" : "nav-link"} onClick={() => {setRole("student");setFeedback("");}}>학생 입장</button>
        <button type="button" aria-pressed={role === "teacher"} className={role === "teacher" ? "nav-active" : "nav-link"} onClick={() => {setRole("teacher");setFeedback("");}}>선생님 방</button>
      </nav></header></div>
    <main className="content">
      {error && <div className="message error" role="alert">로그인 창을 열지 못했어요. 다시 시도하거나 현재 창에서 로그인해 주세요. (가상 오류)</div>}
      {feedback && <div className="message" role="status">{feedback}</div>}
      {role === "teacher" ? <TeacherLogin busy={busy}
        onLogin={() => setFeedback("Google 팝업 callback 확인 · 이 미리보기는 실제 로그인을 실행하지 않아요.")}
        onLoginRedirect={() => setFeedback("현재 창 로그인 callback 확인 · 이 미리보기는 실제 로그인을 실행하지 않아요.")} />
        : <StudentLogin classCode={classCode} cardCode={cardCode} remember={remember} showCard={showCard} busy={busy}
          onClassCodeChange={setClassCode} onCardCodeChange={setCardCode} onRememberChange={setRemember}
          onToggleCard={() => setShowCard((value) => !value)}
          onSubmit={() => setFeedback("학생 입장 callback 확인 · 실제 로그인을 실행하지 않아요.")} />}
      <details><summary>개발 미리보기 상태 설정 · 실제 계정·카드 입력 없이 확인</summary>
        <label><input type="checkbox" checked={busy} onChange={(event) => setBusy(event.target.checked)} />로그인 중 상태</label>
        <label><input type="checkbox" checked={error} onChange={(event) => setError(event.target.checked)} />가상 오류 상태</label>
      </details>
    </main>
  </div>;
}

createRoot(document.getElementById("root")!).render(<LoginPreview />);
