import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { onAuthStateChanged, getIdTokenResult } from "firebase/auth";
import { auth, call, db, logout, studentLogin, teacherLogin } from "./firebase";
import { TeacherRounds } from "./TeacherRounds";
import { StudentRound } from "./StudentRound";
import { StudentRights, TeacherRights } from "./RightsRequests";
import "./style.css";

type TeacherStatus = { status: "pending" | "verified" | "suspended"; displayName: string };
type ClassItem = { classId: string; name: string; schoolYear: number; gradeBand: string; memberCount: number };
type ClassInfo = ClassItem & { classCode: string };
type Member = { studentUid: string; displayName: string; accessStatus: string };
type Card = { studentUid: string; displayName: string; cardCode: string };
type StudentHome = { displayName: string; className: string; round: null | {
  roundId: string; title: string; status: string; targetDisplayName: string | null;
  incomingDisplayName: string | null;
} };
type HistoryRound = {roundId: string; title: string; status: string};

function errorText(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = String(error.code);
    if (code.includes("permission-denied")) return "접근 권한이 없거나 입장 카드가 변경되었어요.";
    if (code.includes("unavailable")) return "연결을 확인하고 다시 시도해 주세요.";
    if (code.includes("unauthenticated")) return "입장 정보를 다시 확인해 주세요.";
    if (code.includes("already-exists")) return "같은 요청 번호가 다른 작업에 사용되었어요. 다시 시작해 주세요.";
    if (code.includes("internal")) return "서비스에 문제가 생겼어요. 잠시 뒤 다시 시도하거나 선생님께 알려 주세요.";
  }
  return error instanceof Error ? error.message : "처리하지 못했어요. 다시 시도해 주세요.";
}

function App() {
  const [route, setRoute] = useState<"student" | "teacher">(window.location.pathname.startsWith("/teacher") ? "teacher" : "student");
  const [role, setRole] = useState<"none" | "teacher" | "student">("none");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [teacher, setTeacher] = useState<TeacherStatus | null>(null);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selected, setSelected] = useState<ClassInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [visibleCardUid, setVisibleCardUid] = useState<string | null>(null);
  const [printCard, setPrintCard] = useState<Card | null>(null);
  const [home, setHome] = useState<StudentHome | null>(null);
  const [historyRounds, setHistoryRounds] = useState<HistoryRound[]>([]);
  const [openHistoryRoundId, setOpenHistoryRoundId] = useState<string | null>(null);
  const [targetVisible, setTargetVisible] = useState(false);
  const [classCodeInput, setClassCodeInput] = useState("");
  const [cardCodeInput, setCardCodeInput] = useState("");
  const [newClassName, setNewClassName] = useState("");
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [newGrade, setNewGrade] = useState("middle");
  const [namesInput, setNamesInput] = useState("");
  const [deleteName, setDeleteName] = useState("");
  const generation = useRef(0);
  const pendingCreate = useRef<{ key: string; requestId: string } | null>(null);
  const pendingRegistration = useRef<{ key: string; requestId: string } | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);

  const clearPrivate = useCallback(() => {
    generation.current += 1;
    setTeacher(null); setClasses([]); setSelected(null); setMembers([]);
    setCards([]); setPrintCard(null); setVisibleCardUid(null); setHome(null); setTargetVisible(false);
    setHistoryRounds([]); setOpenHistoryRoundId(null);
    setCardCodeInput(""); setClassCodeInput("");
  }, []);

  const exit = useCallback(async (broadcast = true) => {
    clearPrivate();
    setRole("none");
    setError(""); setNotice("");
    if (broadcast) channel.current?.postMessage({ type: "logout" });
    await logout();
  }, [clearPrivate]);

  const loadTeacher = useCallback(async () => {
    const current = generation.current;
    const status = await call<null, TeacherStatus>("getTeacherStatus", null);
    if (current !== generation.current) return;
    setTeacher(status);
    if (status.status === "verified") {
      const result = await call<null, { classes: ClassItem[] }>("listClasses", null);
      if (current !== generation.current) return;
      setClasses(result.classes);
    } else {
      setClasses([]); setSelected(null); setMembers([]); setCards([]);
    }
  }, []);

  const loadStudent = useCallback(async () => {
    const current = generation.current;
    const result = await call<null, StudentHome>("getStudentHome", null);
    const historyResult = await call<null, {rounds: HistoryRound[]}>("listStudentRounds", null);
    if (current !== generation.current) return;
    setTargetVisible(false);
    setHome(result);
    setHistoryRounds(historyResult.rounds);
  }, []);

  useEffect(() => {
    channel.current = new BroadcastChannel("manitto-session");
    channel.current.onmessage = (event) => {
      if (event.data?.type === "logout") void exit(false);
    };
    const onPop = () => setRoute(window.location.pathname.startsWith("/teacher") ? "teacher" : "student");
    window.addEventListener("popstate", onPop);
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      clearPrivate();
      const current = generation.current;
      setLoading(true); setError("");
      if (!user) { setRole("none"); setLoading(false); return; }
      try {
        const token = await getIdTokenResult(user);
        if (current !== generation.current) return;
        if (token.claims.role === "student") {
          setRole("student"); setRoute("student");
          await loadStudent();
        } else {
          setRole("teacher"); setRoute("teacher");
          await loadTeacher();
        }
      } catch (caught) {
        await exit();
        setError(errorText(caught));
      } finally { if (current === generation.current) setLoading(false); }
    });
    return () => { unsubscribe(); channel.current?.close(); window.removeEventListener("popstate", onPop); };
  }, [clearPrivate, exit, loadStudent, loadTeacher]);

  useEffect(() => {
    if (role !== "student") return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => { clearTimeout(timer); timer = setTimeout(() => void exit(), 5 * 60_000); };
    for (const name of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(name, reset);
    reset();
    return () => {
      clearTimeout(timer);
      for (const name of ["pointerdown", "keydown", "touchstart"]) window.removeEventListener(name, reset);
    };
  }, [role, exit]);

  useEffect(() => {
    if (role !== "student") return;
    const resume = () => {
      setTargetVisible(false);
      if (document.visibilityState === "visible") void loadStudent().catch(async (caught) => {
        await exit(); setError(errorText(caught));
      });
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", resume);
    return () => { document.removeEventListener("visibilitychange", resume); window.removeEventListener("pageshow", resume); };
  }, [role, loadStudent, exit]);

  useEffect(() => {
    if (role !== "teacher") return;
    const hideCard = () => { if (document.visibilityState !== "visible") setVisibleCardUid(null); };
    document.addEventListener("visibilitychange", hideCard);
    return () => document.removeEventListener("visibilitychange", hideCard);
  }, [role]);

  function navigate(next: "student" | "teacher") {
    history.pushState(null, "", next === "teacher" ? "/teacher" : "/student");
    setRoute(next); setError(""); setNotice(""); setTargetVisible(false);
  }

  async function task(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (caught) { setError(errorText(caught)); }
    finally { setBusy(false); }
  }

  async function selectClass(classId: string) {
    await task(async () => {
      const current = generation.current;
      setCards([]); setPrintCard(null); setVisibleCardUid(null); setDeleteName("");
      const info = await call<{ classId: string }, ClassInfo>("getClassAccessInfo", { classId });
      const result = await getDocs(query(collection(db, `classes/${classId}/members`), orderBy("displayNameSortKey")));
      if (current !== generation.current) return;
      setSelected(info);
      setMembers(result.docs.map((item) => ({ studentUid: item.id, displayName: String(item.get("displayName")), accessStatus: String(item.get("accessStatus")) })));
    });
  }

  async function createClass(event: React.FormEvent) {
    event.preventDefault();
    await task(async () => {
      const key = JSON.stringify([newClassName, newYear, newGrade]);
      if (pendingCreate.current?.key !== key) pendingCreate.current = { key, requestId: crypto.randomUUID() };
      const result = await call<object, { classId: string }>("createClass", {
        name: newClassName, schoolYear: newYear, gradeBand: newGrade, requestId: pendingCreate.current.requestId,
      });
      pendingCreate.current = null;
      setNewClassName("");
      await loadTeacher(); await selectClass(result.classId);
      setNotice("학급을 만들었어요.");
    });
  }

  async function register(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const displayNames = namesInput.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
    if (displayNames.length < 1 || displayNames.length > 40) {
      setError("학생 이름을 줄마다 적어 주세요. 한 번에 1~40명까지 등록할 수 있어요."); return;
    }
    if (members.length + displayNames.length > 40) { setError("한 학급에는 최대 40명까지 등록할 수 있어요."); return; }
    await task(async () => {
      const key = JSON.stringify([selected.classId, displayNames]);
      if (pendingRegistration.current?.key !== key) pendingRegistration.current = { key, requestId: crypto.randomUUID() };
      const result = await call<object, { students: Card[]; requiresCredentialRotation: boolean }>("registerStudents", {
        classId: selected.classId, displayNames, requestId: pendingRegistration.current.requestId,
      });
      pendingRegistration.current = null;
      setCards(result.students); setNamesInput("");
      await loadTeacher(); await selectClass(selected.classId);
      setCards(result.students);
      setNotice(result.requiresCredentialRotation ? "등록은 완료됐지만 카드 원문을 다시 볼 수 없어요. 학생별로 재발급해 주세요." : "학생을 등록했어요. 카드는 지금 개별 인쇄해 주세요.");
    });
  }

  async function rotate(member: Member) {
    if (!selected) return;
    await task(async () => {
      const result = await call<object, { studentUid: string; cardCode: string }>("rotateStudentCredential", {
        classId: selected.classId, studentUid: member.studentUid, requestId: crypto.randomUUID(),
      });
      setCards((old) => [...old.filter((card) => card.studentUid !== member.studentUid), {
        studentUid: member.studentUid, displayName: member.displayName, cardCode: result.cardCode,
      }]);
      setVisibleCardUid(null);
      setNotice(`${member.displayName} 학생의 카드를 재발급했어요. 이전 카드는 사용할 수 없어요.`);
    });
  }

  async function changeAccess(member: Member) {
    if (!selected) return;
    const status = member.accessStatus === "active" ? "blocked" : "active";
    await task(async () => {
      await call<object, object>("setStudentAccess", {
        classId: selected.classId, studentUid: member.studentUid,
        status, requestId: crypto.randomUUID(),
      });
      setMembers((old) => old.map((item) => item.studentUid === member.studentUid ? { ...item, accessStatus: status } : item));
      setNotice(status === "blocked" ? `${member.displayName} 학생의 입장을 차단했어요.` : `${member.displayName} 학생이 다시 입장할 수 있어요.`);
    });
  }

  async function deleteClass() {
    if (!selected || deleteName !== selected.name) return;
    if (!window.confirm(`${selected.name} 학급의 회차·쪽지·카드·학생 계정을 영구 삭제할까요? 되돌릴 수 없어요.`)) return;
    await task(async () => {
      await call<object, object>("deleteClassData", {classId: selected.classId, requestId: crypto.randomUUID()});
      setSelected(null); setMembers([]); setCards([]); setPrintCard(null); setDeleteName("");
      await loadTeacher(); setNotice("학급 데이터를 삭제했어요.");
    });
  }

  function print(card: Card) {
    setPrintCard(card);
    window.setTimeout(() => window.print(), 100);
    window.onafterprint = () => { setPrintCard(null); window.onafterprint = null; };
  }

  return <div className="app-shell">
    <header className="topbar no-print">
      <a className="brand" href="/student" onClick={(event) => { event.preventDefault(); navigate("student"); }}>✉️ <span>우리 반 비밀친구</span></a>
      {role === "none" && <nav aria-label="서비스 선택">
        <button className={route === "student" ? "nav-active" : "nav-link"} onClick={() => navigate("student")}>학생 입장</button>
        <button className={route === "teacher" ? "nav-active" : "nav-link"} onClick={() => navigate("teacher")}>선생님 방</button>
      </nav>}
      {role !== "none" && <button className="small outline" onClick={() => void exit()}>활동 끝내기</button>}
    </header>

    <main className="content no-print">
      <div className="message development-notice" role="note">
        개발 검증 중인 사이트입니다. 개인정보 처리방침과 학교 운영 절차가 확정되기 전에는 실제 학생의 이름·활동 내용을 입력하지 마세요.
      </div>
      {error && <div className="message error" role="alert">{error}</div>}
      {notice && <div className="message success" role="status">{notice}</div>}
      {loading ? <section className="panel centered"><p>입장 정보를 확인하고 있어요…</p></section> :
        role === "student" ? <section className="student-grid">
          <div className="hero student-hero"><span className="eyebrow">우리 반 비밀친구</span><h1>안녕, {home?.displayName}!</h1><p>{home?.className}에서 작은 배려를 함께해요.</p></div>
          <section className="panel pledge"><h2>함께 지킬 약속</h2><p>친구를 편안하게 챙겨요. 어려우면 쉬어도 괜찮아요. 쪽지와 도움 요청은 선생님이 안전을 위해 확인할 수 있어요.</p></section>
          {home?.round ? <section className="panel"><span className="eyebrow">진행 중인 작전</span><h2>{home.round.title}</h2>
            {home.round.targetDisplayName ? <><p>내가 챙겨줄 친구</p><div className="secret-name">{targetVisible ? home.round.targetDisplayName : "•••"}</div>
              <button onClick={() => setTargetVisible(!targetVisible)}>{targetVisible ? "다시 가리기" : "친구 보기"}</button></> : <p>선생님이 준비하고 있어요.</p>}
          </section> : <section className="panel empty"><div className="big-icon">💌</div><h2>선생님이 작전을 준비하고 있어요</h2><p>새 회차가 시작되면 여기에서 내 활동을 볼 수 있어요.</p></section>}
          {home?.round && <StudentRound roundId={home.round.roundId} status={home.round.status} incomingDisplayName={home.round.incomingDisplayName} />}
          {historyRounds.some((item) => item.roundId !== home?.round?.roundId) && <section className="panel"><h2>지난 회차</h2><p>예전 배정과 쪽지 기록은 각 회차 안에서만 볼 수 있어요.</p>{historyRounds.filter((item) => item.roundId !== home?.round?.roundId).map((item) => <button key={item.roundId} className="small outline" onClick={() => setOpenHistoryRoundId((old) => old === item.roundId ? null : item.roundId)}>{item.title} {openHistoryRoundId === item.roundId ? "닫기" : "보기"}</button>)}{openHistoryRoundId && <StudentRound key={openHistoryRoundId} roundId={openHistoryRoundId} status="archived" incomingDisplayName={null} />}</section>}
          <button className="wide outline" disabled={busy} onClick={() => void task(loadStudent)}>새 소식 확인</button>
          <StudentRights />
          <button className="wide secondary" onClick={() => void exit()}>활동 끝내고 다음 친구에게 넘기기</button>
        </section> : route === "student" && role === "none" ? <section className="entry-layout">
          <div className="hero"><span className="eyebrow">학생 입장</span><h1>비밀친구 작전,<br />시작해 볼까요?</h1><p>선생님께 받은 학급 코드와 내 입장 카드 코드를 적어 주세요.</p><div className="envelope">💌</div></div>
          <form className="panel entry-form" onSubmit={(event) => { event.preventDefault(); void task(async () => {
            await studentLogin(classCodeInput, cardCodeInput);
            setCardCodeInput("");
          }); }}>
            <h2>내 카드로 입장하기</h2>
            <label>학급 코드<input autoComplete="off" maxLength={12} value={classCodeInput} onChange={(event) => setClassCodeInput(event.target.value)} placeholder="예: ABCD2345" required /></label>
            <label>개인 카드 코드<input autoComplete="off" maxLength={16} value={cardCodeInput} onChange={(event) => setCardCodeInput(event.target.value)} placeholder="예: ABCD-EFGH2345" required /></label>
            <button className="wide" disabled={busy}>{busy ? "확인 중…" : "입장하기"}</button>
            <p className="help">카드를 잃어버렸거나 입장이 안 되면 선생님께 말씀해 주세요. 이름만으로는 입장할 수 없어요.</p>
          </form>
        </section> : route === "teacher" && role === "none" ? <section className="entry-layout">
          <div className="hero teacher-hero"><span className="eyebrow">선생님 방</span><h1>우리 반의 작은 배려를<br />준비해요</h1><p>확인된 선생님 계정으로 학급을 만들고 학생 카드를 관리할 수 있어요.</p></div>
          <div className="panel entry-form"><h2>선생님 로그인</h2><p>Google 계정으로 로그인한 뒤 운영자의 확인을 기다려 주세요.</p><button className="wide" disabled={busy} onClick={() => void task(teacherLogin)}>{busy ? "로그인 중…" : "Google로 로그인"}</button></div>
        </section> : role === "teacher" && teacher?.status !== "verified" ? <section className="panel centered">
          <div className="big-icon">🔒</div><h1>{teacher?.status === "suspended" ? "이용이 중지됐어요" : "선생님 확인을 기다리고 있어요"}</h1>
          <p>학급 정보는 확인이 끝난 계정에서만 볼 수 있어요.</p>
          <button onClick={() => void task(async () => { await auth.currentUser?.getIdToken(true); await loadTeacher(); })}>상태 다시 확인</button>
        </section> : role === "teacher" ? <section className="teacher-layout">
          <div className="section-heading"><div><span className="eyebrow">선생님 방</span><h1>내 학급</h1></div><p>도움 요청 → 검토할 쪽지 → 활동 확인 → 일정을 살펴보세요.</p></div>
          <div className="teacher-columns"><section className="panel"><h2>학급 목록</h2>
            {classes.length === 0 ? <p className="muted">아직 만든 학급이 없어요.</p> : <ul className="class-list">{classes.map((item) => <li key={item.classId}><button onClick={() => void selectClass(item.classId)}>{item.name}<small>{item.schoolYear} · {item.memberCount}명</small></button></li>)}</ul>}
            <form onSubmit={(event) => void createClass(event)} className="stack"><h3>새 학급 만들기</h3><label>학급 이름<input value={newClassName} maxLength={40} onChange={(event) => setNewClassName(event.target.value)} required /></label>
              <label>학년도<input type="number" value={newYear} onChange={(event) => setNewYear(Number(event.target.value))} required /></label>
              <label>학년군<select value={newGrade} onChange={(event) => setNewGrade(event.target.value)}><option value="lower">1~2학년</option><option value="middle">3~4학년</option><option value="upper">5~6학년</option></select></label>
              <button disabled={busy}>학급 만들기</button></form>
          </section>
          <section className="panel"><h2>{selected ? selected.name : "학급을 선택해 주세요"}</h2>
            {selected ? <><div className="class-code"><span>학급 코드</span><strong>{selected.classCode}</strong><small>입장 카드와 함께 학생에게 안내해 주세요.</small></div>
              <h3>학생 등록</h3><form onSubmit={(event) => void register(event)} className="stack"><label>이름을 한 줄에 한 명씩<textarea rows={5} value={namesInput} onChange={(event) => setNamesInput(event.target.value)} placeholder={"가람\n나래"} /></label><button disabled={busy}>학생 등록하고 카드 만들기</button></form>
              <h3>학생 카드 관리</h3>{members.length === 0 ? <p className="muted">아직 등록한 학생이 없어요.</p> : <ul className="member-list">{members.map((member) => {
                const card = cards.find((item) => item.studentUid === member.studentUid);
                return <li key={member.studentUid}><span>{member.displayName}<small>{member.accessStatus === "active" ? "입장 가능" : "입장 제한"}</small>{card?.cardCode && visibleCardUid === member.studentUid && <code className="card-secret">{card.cardCode}</code>}</span><div>{card?.cardCode && <><button className="small outline" onClick={() => setVisibleCardUid((current) => current === member.studentUid ? null : member.studentUid)}>{visibleCardUid === member.studentUid ? "코드 가리기" : "코드 확인"}</button><button className="small outline" onClick={() => print(card)}>카드 인쇄</button></>}<button className="small outline" disabled={busy} onClick={() => void rotate(member)}>재발급</button><button className="small outline" disabled={busy} onClick={() => void changeAccess(member)}>{member.accessStatus === "active" ? "입장 차단" : "차단 해제"}</button></div></li>;
              })}</ul>}
              {cards.length > 0 && <p className="help">카드 코드는 이 화면을 떠나면 다시 볼 수 없어요. 분실하면 새 카드로 재발급해 주세요.</p>}
            </> : <p className="muted">왼쪽에서 학급을 선택하거나 새로 만들어 주세요.</p>}
          </section></div>
          {selected && <TeacherRounds classId={selected.classId} gradeBand={selected.gradeBand} members={members} />}
          {selected && <TeacherRights classId={selected.classId} />}
          {selected && <section className="panel"><h2>학급 데이터 삭제</h2><p>모든 회차를 보관하거나 취소한 뒤 학급, 학생 카드와 활동 기록을 영구 삭제할 수 있어요. 되돌릴 수 없습니다.</p><label>확인을 위해 학급 이름 입력<input value={deleteName} onChange={(e) => setDeleteName(e.target.value)} /></label><button className="outline" disabled={busy || deleteName !== selected.name} onClick={() => void deleteClass()}>학급 데이터 영구 삭제</button></section>}
        </section> : null}
    </main>

    {printCard && selected && <div className="print-only"><div className="printed-card"><span>💌 우리 반 비밀친구</span><h1>{printCard.displayName} 학생 입장 카드</h1><p>접속 주소: {window.location.origin}/student</p><p>학급 코드 <strong>{selected.classCode}</strong></p><p>내 카드 코드 <strong>{printCard.cardCode}</strong></p><p>나만 쓰는 코드예요. 친구에게 보여주지 마세요.</p></div></div>}
  </div>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
