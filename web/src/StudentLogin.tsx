import loginWorld from "./assets/student-login-world.webp";

type StudentLoginProps = {
  classCode: string;
  cardCode: string;
  remember: boolean;
  showCard: boolean;
  busy: boolean;
  onClassCodeChange: (value: string) => void;
  onCardCodeChange: (value: string) => void;
  onRememberChange: (remember: boolean) => void;
  onToggleCard: () => void;
  onSubmit: () => void;
};

export function StudentLogin({
  classCode, cardCode, remember, showCard, busy,
  onClassCodeChange, onCardCodeChange, onRememberChange, onToggleCard, onSubmit,
}: StudentLoginProps) {
  return <section className="pixel-login" aria-labelledby="pixel-login-title">
    <div className="pixel-login-scenery" aria-hidden="true">
      <img src={loginWorld} alt="" width={1672} height={941} fetchPriority="high" />
    </div>
    <div className="pixel-login-welcome">
      <span className="pixel-login-kicker">함께 쓰는 우리 반 공간</span>
      <h1 id="pixel-login-title">우리 반으로,<br />같이 떠나요!</h1>
      <p>친구들과 함께하는 작은 모험이 기다려요.</p>
    </div>

    <form className="pixel-login-card" onSubmit={(event) => { event.preventDefault(); if (!busy) onSubmit(); }}>
      <header className="pixel-login-card-head">
        <span className="pixel-login-card-label">학생 로그인</span>
        <h2>내 카드로 입장하기</h2>
      </header>

      <label className="pixel-login-field" htmlFor="student-class-code">
        <span>학급 코드</span>
        <input id="student-class-code" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={12}
          value={classCode} onChange={(event) => onClassCodeChange(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          placeholder="선생님이 알려준 학급 코드" required />
      </label>

      <div className="pixel-login-field">
        <div className="pixel-login-field-row">
          <label htmlFor="student-card-code">개인 카드 코드</label>
          <button type="button" className="pixel-login-toggle" aria-pressed={showCard} onClick={onToggleCard}>
            {showCard ? "코드 가리기" : "코드 보기"}
          </button>
        </div>
        <input id="student-card-code" type={showCard ? "text" : "password"} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={16}
          value={cardCode} onChange={(event) => onCardCodeChange(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
          placeholder="카드에 적힌 4자리 코드" required />
      </div>

      <div className="pixel-login-session">
        <label htmlFor="student-remember-me">
          <input id="student-remember-me" type="checkbox" checked={remember} onChange={(event) => onRememberChange(event.target.checked)} />
          <span>이 기기에서 로그인 기억하기</span>
        </label>
        <p>{remember ? <>다음에도 이 기기에서 바로 들어와요.<br />공용 컴퓨터에서는 기억하기를 꺼 주세요.</>
          : <>공용 컴퓨터라면 체크하지 마세요.<br />창을 닫으면 자동으로 로그아웃돼요.</>}</p>
      </div>

      <button type="submit" className="pixel-login-submit" disabled={busy} aria-busy={busy}>
        <span aria-hidden="true">{busy ? "⌛" : "▶"}</span> {busy ? "입장 확인 중…" : "입장하기"}
      </button>
      <p className="pixel-login-help">카드를 잃어버렸거나 입장이 안 되면<br className="pixel-login-help-break" /> 선생님께 말씀해 주세요.</p>
    </form>
  </section>;
}
