import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { observeSchooldocPrivacy } from "./schooldocMissionsPrivacy";
import { WorldPageFrame, WorldPageHeader, WorldPaper, WorldButton, WorldPixelIcon, type WorldIconName } from "./WorldPage";
import {
  SchooldocMissionsError, schooldocCanCancel, schooldocCanReport, schooldocCheckLabel, schooldocToday,
  type SchooldocMission, type SchooldocMissionsClient, type SchooldocMissionView,
} from "./schooldocMissionsApi";
import "./student-today-tasks.css";

type IconName = "refresh" | "check" | "calendar";
function TaskControlIcon({ name, className = "" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    refresh: <path d="M20 4v6h-6M20 10a8 8 0 1 0 0 6" />,
    check: <><circle cx="12" cy="12" r="9" /><path d="m7 12 3 3 7-7" /></>,
    calendar: <><path d="M4 6h16v15H4zM4 10h16M8 3v6M16 3v6M8 14h2M14 14h2M8 17h2" /></>,
  };
  return <svg className={`tt-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">{paths[name]}</svg>;
}

function missionArtwork(title: string): WorldIconName {
  const candidates: WorldIconName[] = [];
  if (/독서|책.{0,8}읽|읽기/.test(title)) candidates.push("book");
  if (/정리|청소|책상.{0,5}닦/.test(title)) candidates.push("desk");
  if (/편지|쪽지/.test(title)) candidates.push("envelope");
  if (/게시|공지|알림/.test(title)) candidates.push("bulletin");
  if (/배려|인사|감사|친절|협력/.test(title)) candidates.push("sprout");
  return candidates.length === 1 ? candidates[0] : "clipboard";
}

function missionDateLabel(value: string, currentYear: string): string {
  const [year, month, day] = value.split("-");
  return `${year === currentYear ? "" : `${year}년 `}${Number(month)}월 ${Number(day)}일`;
}

function MissionCard({ mission, today, busy, locked, onMark, compact = false }: {
  mission: SchooldocMission; today: string; busy: string | null; locked: boolean; compact?: boolean;
  onMark: (mission: SchooldocMission, status: "reported" | "unmarked") => void;
}) {
  const canReport = schooldocCanReport(mission, today);
  const done = ["reported", "pending", "confirmed"].includes(mission.check);
  const canCancel = schooldocCanCancel(mission, today);
  const description = mission.description && <p className="tt-description">{mission.description}</p>;
  const period = <p className="tt-date"><TaskControlIcon name="calendar" /><span>
    <time dateTime={mission.startDate}>{missionDateLabel(mission.startDate, today.slice(0, 4))}</time> ~ <time dateTime={mission.dueDate}>{missionDateLabel(mission.dueDate, today.slice(0, 4))}</time>
  </span></p>;
  const stateNote = mission.check === "pending" ? "완료 표시가 저장됐어요. 선생님의 확인을 기다려요."
    : mission.check === "confirmed" ? "선생님이 확인했어요. 고칠 내용이 있으면 선생님께 말해 주세요."
      : done ? "완료 표시를 저장했어요." : "";
  const cancel = canCancel && <WorldButton variant="secondary" className="tt-cancel" disabled={Boolean(busy) || locked}
    onClick={() => onMark(mission, "unmarked")}>{busy === mission.id ? "저장하는 중…" : "완료 표시 취소"}</WorldButton>;
  const updated = mission.checkedAt && <p className="tt-updated">마지막 변경: <time dateTime={mission.checkedAt}>{new Date(mission.checkedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</time></p>;
  const heading = <div className="tt-mission-heading"><span className={`tt-badge tt-badge--${mission.check}`}>{schooldocCheckLabel(mission, today)}</span>
    <h3 id={`tt-mission-${mission.id}`} tabIndex={-1}>{mission.title}</h3></div>;
  return <article className={`world-section tt-mission${compact ? " tt-mission--compact" : ""}${done ? " is-marked" : ""}`}>
    {compact ? <>
      <div className="tt-mission-top"><span className="tt-complete-symbol"><TaskControlIcon name="check" /></span>{heading}</div>
      {stateNote && <p className="tt-state-note">{stateNote}</p>}
      <details className="tt-mission-management"><summary>{canCancel ? "내용·취소" : "내용 보기"}</summary>
        <div className="tt-mission-management-content">{description}{period}{cancel}{updated}</div></details>
    </> : <>
      <div className="tt-mission-body"><span className="tt-mission-art"><WorldPixelIcon name={missionArtwork(mission.title)} size="large" /></span>
        <div className="tt-mission-copy">{heading}{description}</div></div>
      {period}
      {stateNote && <p className="tt-state-note">{stateNote}</p>}
      {!canReport && mission.check === "unmarked" && <p className="tt-state-note">지금은 완료 표시를 할 수 없어요.</p>}
      {canReport && mission.check === "unmarked" && <WorldButton className="tt-mark" disabled={Boolean(busy) || locked}
        onClick={() => onMark(mission, "reported")}><TaskControlIcon name="check" />{busy === mission.id ? "저장하는 중…" : "완료했어요"}</WorldButton>}
      {cancel}{updated}
    </>}
  </article>;
}

export function StudentTodayTasks({ client, authorize, onBack, onExit, onHelp, preview = false, autoConnect = false }: {
  client: SchooldocMissionsClient;
  authorize: () => Promise<string | void>;
  onBack: () => void;
  onExit: () => void;
  onHelp?: () => void;
  preview?: boolean;
  autoConnect?: boolean;
}) {
  const [mode, setMode] = useState<"name" | "code">("name");
  const [input, setInput] = useState(preview ? "예시 학생" : "");
  const [view, setView] = useState<SchooldocMissionView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; uncertain: boolean } | null>(null);
  const [notice, setNotice] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [today, setToday] = useState(schooldocToday);
  const [autoPaused, setAutoPaused] = useState(false);
  const [reconnectVersion, setReconnectVersion] = useState(0);
  const identity = useRef("");
  const autoResumeAllowed = useRef(true);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const active = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const autoEntryRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const focusMission = useRef<string | null>(null);
  const focusRefresh = useRef(false);
  const connected = Boolean(view);

  const clearConnection = useCallback((message = "", pauseAuto?: boolean) => {
    generation.current += 1;
    active.current?.abort(); active.current = null; inFlight.current = false; identity.current = "";
    focusMission.current = null; focusRefresh.current = false;
    setInput(""); setView(null); setBusy(null); setError(null); setNotice(message); setNeedsRefresh(false);
    if (pauseAuto !== undefined) setAutoPaused(pauseAuto);
  }, []);

  useEffect(() => {
    const stopPrivacyObserver = observeSchooldocPrivacy(() => {
      autoResumeAllowed.current = false;
      flushSync(() => clearConnection(autoConnect ? "" : "다시 본인 이름이나 코드로 접속해 주세요."));
    });
    const reconnect = () => {
      if (document.visibilityState === "visible") { autoResumeAllowed.current = true; setReconnectVersion((value) => value + 1); }
    };
    document.addEventListener("visibilitychange", reconnect);
    window.addEventListener("pageshow", reconnect);
    const timer = window.setInterval(() => setToday(schooldocToday()), 60_000);
    return () => {
      generation.current += 1; active.current?.abort(); active.current = null; inFlight.current = false; identity.current = "";
      stopPrivacyObserver();
      document.removeEventListener("visibilitychange", reconnect);
      window.removeEventListener("pageshow", reconnect);
      window.clearInterval(timer);
    };
  }, [autoConnect, clearConnection]);

  useEffect(() => {
    if (connected) { window.scrollTo(0, 0); titleRef.current?.focus({ preventScroll: true }); }
    else if (autoConnect && autoPaused) autoEntryRef.current?.focus();
    else if (!autoConnect) inputRef.current?.focus();
  }, [autoConnect, autoPaused, connected]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => {
    if (focusMission.current) document.getElementById(`tt-mission-${focusMission.current}`)?.focus();
    focusMission.current = null;
  }, [view]);
  useEffect(() => {
    if (!busy && focusRefresh.current) { focusRefresh.current = false; document.getElementById("tt-refresh")?.focus(); }
  }, [busy, view]);

  const run = useCallback(async (kind: "enter" | "refresh" | "mark", mission?: SchooldocMission, status?: "reported" | "unmarked") => {
    if (inFlight.current || (kind === "mark" && needsRefresh)) return;
    const enteredCredential = kind === "enter" ? input.trim() : identity.current;
    if (!autoConnect && !enteredCredential) return;
    const current = ++generation.current;
    const controller = new AbortController();
    active.current = controller; inFlight.current = true;
    setBusy(mission?.id || kind); setError(null); setNotice("");
    try {
      const verifiedName = await authorize();
      controller.signal.throwIfAborted();
      const credential = autoConnect && typeof verifiedName === "string" ? verifiedName.trim() : autoConnect ? "" : enteredCredential;
      if (!credential) throw new Error("학생 입장 정보를 확인하지 못했어요. 마을로 돌아가 다시 입장해 주세요.");
      if (autoConnect && kind !== "enter" && identity.current !== credential) {
        identity.current = ""; setView(null);
        throw new Error("등록된 이름이 바뀌었어요. 미션을 다시 불러와 주세요.");
      }
      const loaded = kind === "mark" && mission && status
        ? await client.mark(credential, mission.id, status, controller.signal)
        : await client.view(credential, controller.signal);
      if (current !== generation.current) return;
      if (autoConnect && loaded.studentName.trim() !== credential) throw new Error("미션의 학생 이름이 입장 정보와 달라요. 선생님께 확인해 주세요.");
      identity.current = credential;
      if (mission) focusMission.current = mission.id;
      if (kind === "refresh") focusRefresh.current = true;
      setView(loaded); setInput(""); setNeedsRefresh(false); setToday(schooldocToday());
      if (kind === "mark") setNotice(status === "unmarked" ? "완료 표시를 취소했어요." : "완료 표시를 저장했어요.");
      if (kind === "refresh") setNotice("최신 미션을 확인했어요.");
    } catch (cause) {
      if (current !== generation.current || controller.signal.aborted) return;
      const uncertain = kind === "mark" && (!(cause instanceof SchooldocMissionsError) || cause.uncertain);
      if (kind === "mark") setNeedsRefresh(true);
      setError({ message: cause instanceof Error ? cause.message : "연결을 확인하고 다시 시도해 주세요.", uncertain });
    } finally {
      if (current === generation.current) { inFlight.current = false; active.current = null; setBusy(null); }
    }
  }, [authorize, autoConnect, client, input, needsRefresh]);

  useEffect(() => {
    if (autoConnect && autoResumeAllowed.current && !autoPaused && !connected && !error && !busy && document.visibilityState === "visible") void run("enter");
  }, [autoConnect, autoPaused, connected, error, busy, reconnectVersion, run]);

  function enter(event: FormEvent) { event.preventDefault(); void run("enter"); }
  function changeMode(next: "name" | "code") { setMode(next); setInput(""); setError(null); inputRef.current?.focus(); }
  const relevant = view?.missions.filter((mission) => mission.check !== "exempt") ?? [];
  const current = relevant.filter((mission) => schooldocCanReport(mission, today));
  const actionable = current.filter((mission) => mission.check === "unmarked").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const marked = current.filter((mission) => mission.check !== "unmarked");
  const history = relevant.filter((mission) => !schooldocCanReport(mission, today)).sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  const exempt = view?.missions.filter((mission) => mission.check === "exempt") ?? [];
  const completed = relevant.filter((mission) => ["reported", "pending", "confirmed"].includes(mission.check)).length;
  const card = (mission: SchooldocMission, compact = false) => <MissionCard key={mission.id} mission={mission} today={today} busy={busy}
    locked={needsRefresh} compact={compact} onMark={(item, next) => { void run("mark", item, next); }} />;

  return <WorldPageFrame className="today-tasks-page" ariaLabel="오늘 할 일">
      <WorldPageHeader title="오늘 할 일" icon="clipboard" titleRef={titleRef} onBack={onBack} onExit={onExit} />
      <WorldPaper>
        <div className="tt-context"><WorldPixelIcon name="sprout" size="small" /><div><strong>{view ? `${view.className} · ${view.studentName}` : "우리 반의 작은 실천"}</strong>
          <p>선생님이 준비한 미션을 확인해요.</p></div>{onHelp && <WorldButton variant="quiet" onClick={onHelp}>선생님 도움</WorldButton>}</div>
        {error && <div ref={errorRef} className="world-state world-state--error tt-error" role="alert" tabIndex={-1}><strong>{error.message}</strong>
          {view && <p>{error.uncertain ? "저장됐을 수도 있어요. 새로고침으로 기록을 먼저 확인해 주세요." : "새로고침으로 현재 기록을 확인한 뒤 다시 해 보세요."}</p>}</div>}
        {notice && <p className="world-state" role="status">{notice}</p>}
        {!view ? autoConnect ? <div className="tt-entry tt-auto-connect" aria-busy={Boolean(busy)}>
          <WorldPixelIcon name="clipboard" />
          <h2 ref={autoEntryRef} tabIndex={-1}>{busy ? "내 미션을 불러오고 있어요." : autoPaused ? "미션 연결을 마쳤어요." : "내 미션을 다시 확인해 볼까요?"}</h2>
          {busy ? <p role="status">조금만 기다려 주세요.</p> : <WorldButton onClick={() => { setAutoPaused(false); void run("enter"); }}>{autoPaused ? "내 미션 다시 열기" : "다시 불러오기"}</WorldButton>}
          <p className="tt-entry-note">학교에 입장한 내 이름으로 미션을 확인해요.<br />연결이 안 되면 선생님께 알려 주세요.</p>
        </div> : <div className="tt-entry">
          <div className="tt-entry-intro"><WorldPixelIcon name="clipboard" className="tt-entry-art" /><h2>내 미션을 만나 볼까요?</h2>
            <p>선생님이 등록한 본인 이름이나<br />개인 코드로 접속해요.</p></div>
          <form className="tt-entry-form world-field" onSubmit={enter}>
            <div className="tt-mode" role="group" aria-label="미션 접속 방법">
              <WorldButton variant="secondary" disabled={Boolean(busy)} aria-pressed={mode === "name"} onClick={() => changeMode("name")}>이름으로 접속</WorldButton>
              <WorldButton variant="secondary" disabled={Boolean(busy)} aria-pressed={mode === "code"} onClick={() => changeMode("code")}>개인 코드로 접속</WorldButton>
            </div>
            <label htmlFor="tt-identity">{mode === "name" ? "학생 이름" : "개인 접속 코드"}</label>
            <input ref={inputRef} id="tt-identity" name="mission-identity" type={mode === "code" ? "password" : "text"}
              autoComplete="off" autoCapitalize={mode === "code" ? "characters" : "off"} spellCheck={false} maxLength={30}
              disabled={Boolean(busy)} value={input} onChange={(event) => setInput(event.target.value)}
              placeholder={mode === "name" ? "본인 이름을 입력해 주세요" : "선생님께 받은 12자리 코드"} aria-describedby="tt-entry-help" required />
            <p id="tt-entry-help">{mode === "name" ? "같은 이름의 학생이 있으면 개인 코드로 접속해요." : "학교 입장 카드와 다른, 미션용 개인 코드예요."}</p>
            <WorldButton type="submit" className="tt-submit" disabled={Boolean(busy) || !input.trim()}><TaskControlIcon name="check" />{busy ? "확인하는 중…" : "내 미션 보기"}</WorldButton>
          </form>
          <p className="tt-entry-note">마을로 돌아가거나 다른 화면으로 옮기면 미션 접속 정보는 지워져요.</p>
        </div> : <>
          <div className="tt-summary" aria-label="내 미션 현황">
            <div><WorldPixelIcon name="clipboard" size="small" /><span>지금 할 일 <strong>{actionable.length}<small>건</small></strong></span></div>
            <div><TaskControlIcon name="check" /><span>완료 표시 <strong>{completed}<small>건</small></strong></span></div>
          </div>
          <section className="tt-task-section" aria-labelledby="tt-current-title">
            <div className="tt-section-head"><h2 id="tt-current-title"><WorldPixelIcon name="sprout" size="small" />지금 할 일</h2>
              <WorldButton id="tt-refresh" variant="secondary" disabled={Boolean(busy)} onClick={() => { void run("refresh"); }}><TaskControlIcon name="refresh" />{busy === "refresh" ? "확인하는 중…" : "새로고침"}</WorldButton></div>
            {needsRefresh && <p className="world-state world-state--warning">현재 저장 상태를 확인할 때까지 완료 표시와 취소를 잠시 멈춰요.</p>}
            {actionable.length ? <div className="tt-mission-grid">{actionable.map((mission) => card(mission))}</div>
              : <div className="tt-empty"><TaskControlIcon name="check" /><h3>{relevant.length ? "지금 완료 표시할 미션이 없어요." : "아직 볼 수 있는 미션이 없어요."}</h3><p>{relevant.length ? "아래에서 완료 기록과 지난 미션을 볼 수 있어요." : "선생님이 새 미션을 준비하면 여기에 보여요."}</p></div>}
          </section>
          {marked.length > 0 && <section className="tt-marked-section" aria-labelledby="tt-marked-title"><h2 id="tt-marked-title"><TaskControlIcon name="check" />완료 표시한 미션</h2><div className="tt-marked-list">{marked.map((mission) => card(mission, true))}</div></section>}
          {history.length > 0 && <details className="tt-history"><summary>시작 전·지난 미션 <span>{history.length}건</span></summary><div className="tt-mission-grid">{history.map((mission) => card(mission))}</div></details>}
          {exempt.length > 0 && <details className="tt-history"><summary>해당 없는 미션 <span>{exempt.length}건</span></summary><div className="tt-mission-grid">{exempt.map((mission) => card(mission))}</div></details>}
          <p className="tt-meaning">완료 표시는 내가 했다고 알린 기록이에요. ‘선생님 확인 완료’는 선생님이 확인한 상태예요.</p>
          <div className="tt-connection-actions"><WorldButton variant="quiet" onClick={() => clearConnection("", true)}>미션 연결 끝내기</WorldButton></div>
        </>}
        <footer className="tt-footer"><p>{preview ? "화면 미리보기 · 가상 데이터로만 작동해요." : "공용 기기라면 이용 후 ‘활동 마치기’를 눌러 주세요."}</p></footer>
      </WorldPaper>
  </WorldPageFrame>;
}
