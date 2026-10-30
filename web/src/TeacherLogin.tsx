import loginWorld from "./assets/student-login-world.webp";

type TeacherLoginProps = {
  busy: boolean;
  onLogin: () => void;
  onLoginRedirect: () => void;
};

export function TeacherLogin({ busy, onLogin, onLoginRedirect }: TeacherLoginProps) {
  return <section className="pixel-login teacher-login" aria-labelledby="teacher-login-title">
    <div className="pixel-login-scenery" aria-hidden="true">
      <img src={loginWorld} alt="" width={1672} height={941} fetchPriority="high" />
    </div>
    <div className="pixel-login-welcome">
      <span className="pixel-login-kicker">함께 쓰는 우리 반 공간</span>
      <h1 id="teacher-login-title">우리 반으로,<br />같이 떠나요!</h1>
      <p>우리 반의 하루를 함께 준비해요.</p>
    </div>

    <form className="pixel-login-card" aria-busy={busy} aria-labelledby="teacher-login-card-title" aria-describedby="teacher-login-description"
      onSubmit={(event) => { event.preventDefault(); if (!busy) onLogin(); }}>
      <header className="pixel-login-card-head">
        <span className="pixel-login-card-label">교사 로그인</span>
        <h2 id="teacher-login-card-title">선생님 방으로 입장하기</h2>
      </header>
      <p id="teacher-login-description" className="teacher-login-description">학급·명부·입장 카드를 준비하고<br />서비스별 활동을 관리해요.</p>
      <button type="submit" className="pixel-login-submit" disabled={busy} aria-busy={busy}>
        <span aria-hidden="true">{busy ? "⌛" : "▶"}</span> {busy ? "로그인 중…" : "Google로 로그인"}
      </button>
      <button type="button" className="pixel-login-toggle teacher-login-redirect" disabled={busy}
        onClick={() => { if (!busy) onLoginRedirect(); }}>
        팝업이 안 열리면 현재 창에서 로그인
      </button>
      <p className="pixel-login-help">Google 계정으로 본인을 인증해요.<br />교사 확인 후 기존 학급을 이어서 관리할 수 있어요.</p>
    </form>
  </section>;
}
