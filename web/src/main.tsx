import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { onAuthStateChanged, getIdTokenResult } from "firebase/auth";
import { auth, call, consumeAuthRedirectError, db, logout, prepareTeacherAuth, studentLogin, teacherLogin, teacherLoginRedirect } from "./firebase";
import { TeacherRounds, type TeacherStatusSection } from "./TeacherRounds";
import { TeacherAssignments } from "./TeacherAssignments";
import { StudentRound, type StudentMissionUi } from "./StudentRound";
import { emptyStudentMailDraft, type StudentMailDraft } from "./StudentMail";
import { StudentCommunity } from "./StudentCommunity";
import { StudentRights, TeacherRights } from "./RightsRequests";
import { CheckboxRow, ConfirmDialog } from "./DesignSystem";
import { StudentRosterImporter } from "./StudentRosterImporter";
import "./style.css";

type TeacherPage = "classes" | "overview" | "students" | "rounds" | "assignments" | "status" | "history" | "settings";
type StudentPage = "today" | "missions" | "mail" | "community" | "help" | "history";
const teacherPages: Array<{id: TeacherPage; label: string}> = [
  {id:"overview",label:"운영 요약"},{id:"rounds",label:"시즌 설정"},{id:"assignments",label:"배정 확인"},
  {id:"students",label:"입장 카드"},{id:"status",label:"상태 확인"},
  {id:"history",label:"지난 활동"},{id:"settings",label:"정보 요청·삭제"},
];
function teacherLocation(path: string): {classId: string | null; page: TeacherPage} {
  const parts = path.split("/").filter(Boolean);
  const page = parts[3] === "safety" ? "status" : parts[3];
  return { classId: parts[1] === "classes" && parts[2] ? parts[2] : null,
    page: teacherPages.some((item) => item.id === page) ? page as TeacherPage : parts[2] ? "overview" : "classes" };
}

type TeacherStatus = { status: "pending" | "verified" | "suspended"; displayName: string };
type ClassItem = { classId: string; classCode?: string; name: string; schoolYear: number; gradeBand: string; memberCount: number };
type ClassInfo = ClassItem & { classCode: string };
type Member = { studentUid: string; displayName: string; accessStatus: string; printableCardAvailable: boolean };
type Card = { studentUid: string; displayName: string; cardCode: string };
type PrintSheet = { cards: Card[]; qrDataUrl: string; entryUrl: string };
type StudentHome = { displayName: string; className: string; gradeBand?: string; round: null | {
  roundId: string; title: string; status: string;
} };
type HistoryRound = {roundId: string; title: string; status: string; startsAt?: string};
const koreaDateLabel = (iso?: string) => iso ? new Intl.DateTimeFormat("ko-KR", {timeZone:"Asia/Seoul",year:"numeric",month:"numeric",day:"numeric"}).format(new Date(iso)) : "";

function errorText(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = String(error.code);
    if (code.includes("popup-blocked")) return "브라우저에서 Google 로그인 팝업 창이 차단되었어요. 팝업 차단을 해제하거나 아래 '팝업이 안 열리면 현재 창에서 로그인'을 눌러 주세요.";
    if (code.includes("popup-closed-by-user") || code.includes("cancelled-popup-request")) return "Google 로그인 창이 닫혔어요. 다시 로그인 버튼을 눌러 주세요.";
    if (code.includes("unauthorized-domain")) return "현재 접속 주소가 로그인 허용 도메인에 등록되지 않았어요. 공식 주소(manito-one-blond.vercel.app)로 접속해 주세요.";
    if (code.includes("web-storage-unsupported")) return "브라우저의 쿠키·저장소 차단 설정 때문에 로그인 창을 열지 못했어요. 일반 브라우저 창에서 다시 시도해 주세요.";
    if (code.includes("operation-not-supported-in-this-environment")) return "현재 브라우저 환경에서는 팝업 로그인을 사용할 수 없어요. 아래 '팝업이 안 열리면 현재 창에서 로그인'을 눌러 주세요.";
    if (code.includes("network-request-failed")) return "네트워크 연결을 확인하고 다시 시도해 주세요.";
    if (code.includes("permission-denied")) return "접근 권한이 없거나 입장 정보가 변경되었어요.";
    if (code.includes("unavailable")) return "연결을 확인하고 다시 시도해 주세요.";
    if (code.includes("unauthenticated")) return "입장 정보를 다시 확인해 주세요.";
    if (code.includes("already-exists")) return "같은 요청 번호가 다른 작업에 사용되었어요. 다시 시작해 주세요.";
    if (code.includes("internal")) return "서비스에 문제가 생겼어요. 잠시 뒤 다시 시도하거나 선생님께 알려 주세요.";
  }
  return error instanceof Error ? error.message : "처리하지 못했어요. 다시 시도해 주세요.";
}

function App() {
  const [route, setRoute] = useState<"student" | "teacher">(window.location.pathname.startsWith("/teacher") ? "teacher" : "student");
  const [teacherPage, setTeacherPage] = useState<TeacherPage>(() => teacherLocation(window.location.pathname).page);
  const [teacherStatusTarget, setTeacherStatusTarget] = useState<TeacherStatusSection | null>(null);
  const [studentPage, setStudentPage] = useState<StudentPage>(() => {
    const page = window.location.pathname.split("/")[2];
    return ["missions","mail","community","help","history"].includes(page) ? page as StudentPage : "today";
  });
  const [studentMissionUi, setStudentMissionUi] = useState<StudentMissionUi>({filter:"all",category:"전체",limit:8});
  const [role, setRole] = useState<"none" | "teacher" | "student">("none");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [teacher, setTeacher] = useState<TeacherStatus | null>(null);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selected, setSelected] = useState<ClassInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [cardCodes, setCardCodes] = useState<Record<string, string>>({});
  const [cardCodesLoading, setCardCodesLoading] = useState(false);
  const [cardCodesError, setCardCodesError] = useState(false);
  const [cardCodesHidden, setCardCodesHidden] = useState(false);
  const [printSheet, setPrintSheet] = useState<PrintSheet | null>(null);
  const [selectedCardUids, setSelectedCardUids] = useState<string[]>([]);
  const [pendingPrint, setPendingPrint] = useState<{studentUids: string[]; missingStudentUids: string[]} | null>(null);
  const [home, setHome] = useState<StudentHome | null>(null);
  const [historyRounds, setHistoryRounds] = useState<HistoryRound[]>([]);
  const [studentRefreshVersion, setStudentRefreshVersion] = useState(0);
  const [openHistoryRoundId, setOpenHistoryRoundId] = useState<string | null>(null);
  const [classCodeInput, setClassCodeInput] = useState("");
  const [cardCodeInput, setCardCodeInput] = useState("");
  const [rememberStudent, setRememberStudent] = useState(false);
  const [showCardInput, setShowCardInput] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [newClassCode, setNewClassCode] = useState("");
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [newGrade, setNewGrade] = useState("middle");
  const [namesInput, setNamesInput] = useState("");
  const [deleteName, setDeleteName] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberFilter, setMemberFilter] = useState("all");
  const [showCreateClass, setShowCreateClass] = useState(false);
  const [confirmMember, setConfirmMember] = useState<{member: Member; action: "rotate" | "block" | "remove"} | null>(null);
  const [confirmBatchReissue, setConfirmBatchReissue] = useState<{ studentUids: string[]; label: string } | null>(null);
  const [classToDelete, setClassToDelete] = useState<ClassItem | null>(null);
  const [isEditingClassCode, setIsEditingClassCode] = useState(false);
  const [editingClassCodeInput, setEditingClassCodeInput] = useState("");
  const [showCardImporter, setShowCardImporter] = useState(false);
  const [editingMemberUid, setEditingMemberUid] = useState<string | null>(null);
  const [editingMemberName, setEditingMemberName] = useState("");
  const [editClassName, setEditClassName] = useState("");
  const [editClassCode, setEditClassCode] = useState("");
  const [editClassYear, setEditClassYear] = useState(new Date().getFullYear());
  const [editClassGrade, setEditClassGrade] = useState("middle");
  const generation = useRef(0);
  const classesRef = useRef<ClassItem[]>([]);
  const classSelectVersion = useRef(0);
  const studentRoundId = useRef<string | null>(null);
  const studentMailDraft = useRef<StudentMailDraft>(emptyStudentMailDraft());
  const roundDirty = useRef(false);
  const lastTeacherPath = useRef(window.location.pathname);
  const pendingCreate = useRef<{ key: string; requestId: string } | null>(null);
  const pendingRegistration = useRef<{ key: string; requestId: string } | null>(null);
  const printTimeout = useRef<number | null>(null);
  const cardCodeTimeout = useRef<number | null>(null);
  const cardReadVersion = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const mobileTeacherMenu = useRef<HTMLDetailsElement | null>(null);
  const focusStudentTitleAfterNavigation = useRef(false);
  const preserveErrorOnSignOut = useRef(false);

  useEffect(() => {
    if (selected) {
      setEditClassName(selected.name);
      setEditClassCode(selected.classCode || "");
      setEditClassYear(selected.schoolYear);
      setEditClassGrade(selected.gradeBand);
    }
  }, [selected?.classId, selected?.name, selected?.classCode, selected?.schoolYear, selected?.gradeBand]);

  useEffect(() => {
    if (!focusStudentTitleAfterNavigation.current) return;
    focusStudentTitleAfterNavigation.current = false;
    document.querySelector<HTMLElement>(".student-page-title")?.focus();
  }, [studentPage]);

  useEffect(() => {
    if (route === "teacher" && role === "none") prepareTeacherAuth();
  }, [route, role]);

  const clearPrivate = useCallback(() => {
    generation.current += 1;
    classSelectVersion.current += 1;
    classesRef.current = [];
    setTeacher(null); setClasses([]); setSelected(null); setMembers([]); setMembersLoading(false);
    setPrintSheet(null); setSelectedCardUids([]); setPendingPrint(null); setHome(null);
    cardReadVersion.current++; setCardCodes({}); setCardCodesHidden(false);
    if (cardCodeTimeout.current !== null) window.clearTimeout(cardCodeTimeout.current);
    setHistoryRounds([]); setOpenHistoryRoundId(null);
    studentRoundId.current = null; setStudentMissionUi({filter:"all",category:"전체",limit:8});
    studentMailDraft.current = emptyStudentMailDraft();
    setCardCodeInput(""); setClassCodeInput(""); setShowCardInput(false);
    setTeacherPage("classes"); setStudentPage("today"); setConfirmMember(null);
    setEditingMemberUid(null); setEditingMemberName("");
    roundDirty.current = false;
  }, []);

  const exit = useCallback(async (broadcast = true, keepError = false) => {
    clearPrivate();
    setRole("none");
    if (!keepError) setError("");
    setNotice("");
    if (keepError) preserveErrorOnSignOut.current = true;
    if (broadcast) channel.current?.postMessage({ type: "logout" });
    await logout();
  }, [clearPrivate]);

  const loadTeacher = useCallback(async () => {
    const current = generation.current;
    const currentUser = auth.currentUser;
    const initialToken = currentUser ? await getIdTokenResult(currentUser) : null;
    const alreadyVerifiedClaim = initialToken?.claims.role === "teacher" && initialToken?.claims.teacherVerified === true;

    if (alreadyVerifiedClaim) {
      const [status, result] = await Promise.all([
        call<null, TeacherStatus>("getTeacherStatus", null),
        call<null, { classes: ClassItem[] }>("listClasses", null),
      ]);
      if (current !== generation.current) return;
      setTeacher(status);
      if (status.status === "verified") {
        classesRef.current = result.classes;
        setClasses(result.classes);
      } else {
        classesRef.current = [];
        setClasses([]); setSelected(null); setMembers([]);
      }
      return;
    }

    const status = await call<null, TeacherStatus>("getTeacherStatus", null);
    if (current !== generation.current) return;
    setTeacher(status);
    if (status.status === "verified") {
      if (auth.currentUser) {
        const token = await getIdTokenResult(auth.currentUser);
        if (token.claims.role !== "teacher" || token.claims.teacherVerified !== true) {
          await auth.currentUser.getIdToken(true);
        }
      }
      if (current !== generation.current) return;
      const result = await call<null, { classes: ClassItem[] }>("listClasses", null);
      if (current !== generation.current) return;
      classesRef.current = result.classes;
      setClasses(result.classes);
    } else {
      classesRef.current = [];
      setClasses([]); setSelected(null); setMembers([]);
    }
  }, []);

  const loadStudent = useCallback(async () => {
    const current = generation.current;
    const [result, historyResult] = await Promise.all([
      call<null, StudentHome>("getStudentHome", null),
      call<null, {rounds: HistoryRound[]}>("listStudentRounds", null),
    ]);
    if (current !== generation.current) return;
    if (studentRoundId.current !== result.round?.roundId) {
      studentRoundId.current = result.round?.roundId ?? null;
      setStudentMissionUi({filter:"all",category:"전체",limit:8});
      studentMailDraft.current = emptyStudentMailDraft();
    }
    setHome(result);
    setHistoryRounds(historyResult.rounds);
    setStudentRefreshVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    void consumeAuthRedirectError().then((redirectError) => {
      if (redirectError) setError(errorText(redirectError));
    });
    channel.current = new BroadcastChannel("manitto-session");
    channel.current.onmessage = (event) => {
      if (event.data?.type === "logout") void exit(false);
    };
    const onPop = () => {
      const path = window.location.pathname;
      if (roundDirty.current && !window.confirm("저장하지 않은 시즌 준비 내용이 있어요. 입력을 버리고 이동할까요?")) {
        history.pushState(null, "", lastTeacherPath.current);
        return;
      }
      roundDirty.current = false;
      if (path.startsWith("/teacher")) lastTeacherPath.current = path;
      setRoute(path.startsWith("/teacher") ? "teacher" : "student");
      if (path.startsWith("/teacher")) {
        const location = teacherLocation(path);
        if (location.classId) void selectClass(location.classId, location.page, false);
        else { setSelected(null); setTeacherPage("classes"); }
      } else {
        const page = path.split("/")[2];
        focusStudentTitleAfterNavigation.current = true;
        setStudentPage(["missions","mail","community","help","history"].includes(page) ? page as StudentPage : "today");
      }
    };
    window.addEventListener("popstate", onPop);
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      clearPrivate();
      const current = generation.current;
      setLoading(true);
      if (preserveErrorOnSignOut.current) {
        preserveErrorOnSignOut.current = false;
      } else {
        setError("");
      }
      if (!user) { setRole("none"); setLoading(false); return; }
      try {
        const token = await getIdTokenResult(user);
        if (current !== generation.current) return;
        if (token.claims.role === "student") {
          setRole("student"); setRoute("student");
          if (!window.location.pathname.startsWith("/student")) history.replaceState(null, "", "/student");
          const studentPath = window.location.pathname.split("/")[2];
          setStudentPage(["missions", "mail", "community", "help", "history"].includes(studentPath) ? studentPath as StudentPage : "today");
          await loadStudent();
        } else {
          setRole("teacher"); setRoute("teacher");
          await loadTeacher();
          const location = teacherLocation(window.location.pathname);
          if (location.classId) await selectClass(location.classId, location.page, false);
          else if (!window.location.pathname.startsWith("/teacher")) history.replaceState(null, "", "/teacher");
        }
      } catch (caught) {
        const message = errorText(caught);
        await exit(true, true);
        setError(message);
      } finally { if (current === generation.current) setLoading(false); }
    });
    return () => { unsubscribe(); channel.current?.close(); window.removeEventListener("popstate", onPop); };
  }, [clearPrivate, exit, loadStudent, loadTeacher]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (roundDirty.current) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

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
      if (document.visibilityState === "visible") void loadStudent().catch(async (caught) => {
        await exit(); setError(errorText(caught));
      });
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", resume);
    return () => { document.removeEventListener("visibilitychange", resume); window.removeEventListener("pageshow", resume); };
  }, [role, loadStudent, exit]);

  useEffect(() => {
    if (mobileTeacherMenu.current) mobileTeacherMenu.current.open = false;
  }, [teacherPage]);

  function navigate(next: "student" | "teacher") {
    history.pushState(null, "", next === "teacher" ? "/teacher" : "/student");
    setRoute(next); setTeacherPage("classes"); setStudentPage("today");
    setTeacherStatusTarget(null);
    setError(""); setNotice(""); setShowCardInput(false);
  }

  function openTeacherPage(page: TeacherPage, section?: TeacherStatusSection) {
    if (!selected) return;
    if (page !== teacherPage && roundDirty.current && !window.confirm("저장하지 않은 시즌 준비 내용이 있어요. 입력을 버리고 이동할까요?")) return;
    if (page !== teacherPage) roundDirty.current = false;
    setTeacherPage(page); setError(""); setNotice("");
    setTeacherStatusTarget(page === "status" ? section ?? null : null);
    setPrintSheet(null); setPendingPrint(null);
    if (page !== "students") setSelectedCardUids([]);
    history.pushState(null, "", `/teacher/classes/${selected.classId}/${page}`);
    lastTeacherPath.current = window.location.pathname;
    window.scrollTo(0, 0);
  }

  function openClasses() {
    if (roundDirty.current && !window.confirm("저장하지 않은 시즌 준비 내용이 있어요. 입력을 버리고 학급 목록으로 이동할까요?")) return;
    roundDirty.current = false;
    setTeacherPage("classes"); setTeacherStatusTarget(null); setPrintSheet(null); setPendingPrint(null); setSelectedCardUids([]);
    history.pushState(null, "", "/teacher");
    lastTeacherPath.current = "/teacher";
    window.scrollTo(0, 0);
  }

  function openStudentPage(page: StudentPage) {
    if (studentPage === page) return;
    if (studentPage === "mail" && page !== "mail"
      && Object.values(studentMailDraft.current.drafts).some((draft) => draft.freeText.trim())
      && !window.confirm("작성 중인 쪽지가 있어요. 다른 화면으로 이동할까요? 내용은 이 입장 동안만 남아요.")) return;
    focusStudentTitleAfterNavigation.current = true;
    setStudentPage(page); setOpenHistoryRoundId(null);
    setError(""); setNotice("");
    history.pushState(null, "", page === "today" ? "/student" : `/student/${page}`);
    window.scrollTo(0, 0);
  }

  async function task(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (caught) { setError(errorText(caught)); }
    finally { setBusy(false); }
  }

  async function selectClass(classId: string, page: TeacherPage = "overview", recordHistory = true) {
    if (roundDirty.current && !window.confirm("저장하지 않은 시즌 준비 내용이 있어요. 입력을 버리고 학급을 바꿀까요?")) return;
    roundDirty.current = false;
    const current = generation.current;
    const selectVersion = ++classSelectVersion.current;
    setPrintSheet(null); setSelectedCardUids([]); setPendingPrint(null); setDeleteName("");
    setError(""); setNotice("");

    const cached = classesRef.current.find((item) => item.classId === classId)
      ?? (selected?.classId === classId ? selected : null);
    if (cached) {
      setSelected({
        ...cached,
        classCode: cached.classCode || (selected?.classId === classId ? selected.classCode : ""),
      });
      if (selected?.classId !== classId) setMembers([]);
      setMembersLoading(true);
      setTeacherPage(page);
      setTeacherStatusTarget(null);
      if (recordHistory) history.pushState(null, "", `/teacher/classes/${classId}/${page}`);
      lastTeacherPath.current = window.location.pathname;
      window.scrollTo(0, 0);
    }

    await task(async () => {
      try {
        const previewMembers = (window as unknown as { __MANITTO_PREVIEW__?: { members?: Member[] } }).__MANITTO_PREVIEW__?.members;
        const membersPromise = previewMembers
          ? Promise.resolve(previewMembers)
          : getDocs(query(collection(db, `classes/${classId}/members`), orderBy("displayNameSortKey"))).then((result) =>
            result.docs.map((item) => ({
              studentUid: item.id,
              displayName: String(item.get("displayName")),
              accessStatus: String(item.get("accessStatus")),
              printableCardAvailable: item.get("printableCardAvailable") === true,
            })),
          );
        const infoPromise: Promise<ClassInfo> = cached?.classCode
          ? Promise.resolve({ ...cached, classCode: cached.classCode })
          : call<{ classId: string }, ClassInfo>("getClassAccessInfo", { classId });

        const [info, loadedMembers] = await Promise.all([infoPromise, membersPromise]);
        if (current !== generation.current || selectVersion !== classSelectVersion.current) return;
        setSelected(info);
        if (!cached?.classCode && info.classCode) {
          const updated = classesRef.current.map((item) => item.classId === classId ? { ...item, classCode: info.classCode } : item);
          classesRef.current = updated;
          setClasses(updated);
        }
        setMembers(loadedMembers);
        if (!cached) {
          setTeacherPage(page);
          setTeacherStatusTarget(null);
          if (recordHistory) history.pushState(null, "", `/teacher/classes/${classId}/${page}`);
          lastTeacherPath.current = window.location.pathname;
          window.scrollTo(0, 0);
        }
      } finally {
        if (current === generation.current && selectVersion === classSelectVersion.current) {
          setMembersLoading(false);
        }
      }
    });
  }

  async function createClass(event: React.FormEvent) {
    event.preventDefault();
    await task(async () => {
      const createdName = newClassName.trim();
      const createdCode = newClassCode.trim().toUpperCase();
      const key = JSON.stringify([createdName, newYear, newGrade, createdCode]);
      if (pendingCreate.current?.key !== key) pendingCreate.current = { key, requestId: crypto.randomUUID() };
      const result = await call<object, { classId: string; classCode?: string }>("createClass", {
        name: createdName,
        schoolYear: newYear,
        gradeBand: newGrade,
        ...(createdCode ? { classCode: createdCode } : {}),
        requestId: pendingCreate.current.requestId,
      });
      pendingCreate.current = null;
      setNewClassName("");
      setNewClassCode("");
      const optimisticItem: ClassItem = {
        classId: result.classId,
        classCode: result.classCode,
        name: createdName,
        schoolYear: newYear,
        gradeBand: newGrade,
        memberCount: 0,
      };
      const nextClasses = [...classesRef.current.filter((item) => item.classId !== result.classId), optimisticItem];
      classesRef.current = nextClasses;
      setClasses(nextClasses);
      await Promise.all([loadTeacher(), selectClass(result.classId)]);
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
      setNamesInput("");
      await loadTeacher(); await selectClass(selected.classId, "students");
      setNotice(result.requiresCredentialRotation ? "학생 등록은 완료됐어요. 출력을 눌러 카드를 확인해 주세요." : "학생을 등록했어요. 전체 또는 원하는 학생의 카드를 출력해 주세요.");
    });
  }

  async function rotate(member: Member) {
    if (!selected) return;
    await task(async () => {
      const result = await call<object, { studentUid: string; cardCode: string }>("rotateStudentCredential", {
        classId: selected.classId, studentUid: member.studentUid, requestId: crypto.randomUUID(),
      });
      setMembers((old) => old.map((item) => item.studentUid === member.studentUid
        ? {...item, printableCardAvailable: true} : item));
      await print([{studentUid: member.studentUid, displayName: member.displayName, cardCode: result.cardCode}]);
      setNotice(`${member.displayName} 학생의 새 카드를 출력합니다. 이전 카드는 사용할 수 없어요.`);
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
      if (status === "blocked") setSelectedCardUids((old) => old.filter((uid) => uid !== member.studentUid));
      setNotice(status === "blocked" ? `${member.displayName} 학생의 입장을 차단했어요.` : `${member.displayName} 학생이 다시 입장할 수 있어요.`);
    });
  }

  async function saveMemberName(member: Member) {
    if (!selected) return;
    const trimmed = editingMemberName.trim();
    if (!trimmed) { setError("학생 이름을 입력해 주세요."); return; }
    if (trimmed === member.displayName) { setEditingMemberUid(null); return; }
    await task(async () => {
      const result = await call<object, { studentUid: string; displayName: string }>("updateStudentName", {
        classId: selected.classId,
        studentUid: member.studentUid,
        displayName: trimmed,
        requestId: crypto.randomUUID(),
      });
      setMembers((old) =>
        old.map((item) => item.studentUid === member.studentUid ? { ...item, displayName: result.displayName } : item)
          .sort((a, b) => a.displayName.localeCompare(b.displayName, "ko-KR")),
      );
      setEditingMemberUid(null);
      setNotice(`${member.displayName} 학생의 이름을 ${result.displayName}(으)로 수정했어요.`);
    });
  }

  async function removeMember(member: Member) {
    if (!selected) return;
    await task(async () => {
      await call<object, object>("removeStudentMember", {
        classId: selected.classId,
        studentUid: member.studentUid,
        requestId: crypto.randomUUID(),
      });
      setMembers((old) => old.filter((item) => item.studentUid !== member.studentUid));
      setSelectedCardUids((old) => old.filter((uid) => uid !== member.studentUid));
      setCardCodes((old) => { const next = { ...old }; delete next[member.studentUid]; return next; });
      const nextCount = Math.max(0, (selected.memberCount ?? members.length) - 1);
      setSelected((old) => old ? { ...old, memberCount: nextCount } : old);
      const updatedClasses = classesRef.current.map((item) =>
        item.classId === selected.classId ? { ...item, memberCount: nextCount } : item,
      );
      classesRef.current = updatedClasses;
      setClasses(updatedClasses);
      setNotice(`${member.displayName} 학생을 명단에서 삭제했어요.`);
    });
  }

  async function updateClassBasicInfo(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const trimmed = editClassName.trim();
    if (!trimmed) { setError("학급 이름을 입력해 주세요."); return; }
    const trimmedCode = editClassCode.trim().toUpperCase();
    await task(async () => {
      const result = await call<object, { classId: string; name: string; schoolYear: number; gradeBand: string; classCode: string }>("updateClassInfo", {
        classId: selected.classId,
        name: trimmed,
        schoolYear: editClassYear,
        gradeBand: editClassGrade,
        ...(trimmedCode ? { classCode: trimmedCode } : {}),
        requestId: crypto.randomUUID(),
      });
      const updatedSelected: ClassInfo = {
        ...selected,
        name: result.name,
        classCode: result.classCode || selected.classCode,
        schoolYear: result.schoolYear,
        gradeBand: result.gradeBand,
      };
      setSelected(updatedSelected);
      const updatedClasses = classesRef.current.map((item) =>
        item.classId === selected.classId
          ? { ...item, name: result.name, classCode: result.classCode || item.classCode, schoolYear: result.schoolYear, gradeBand: result.gradeBand }
          : item,
      );
      classesRef.current = updatedClasses;
      setClasses(updatedClasses);
      setNotice("학급 기본 정보를 수정했어요.");
    });
  }

  async function deleteClass() {
    if (!selected || deleteName !== selected.name) return;
    if (!window.confirm(`${selected.name} 학급의 시즌·쪽지·카드·학생 계정을 영구 삭제할까요? 되돌릴 수 없어요.`)) return;
    await task(async () => {
      await call<object, object>("deleteClassData", {classId: selected.classId, requestId: crypto.randomUUID()});
      setSelected(null); setMembers([]); setPrintSheet(null); setSelectedCardUids([]); setPendingPrint(null); setDeleteName("");
      await loadTeacher(); setNotice("학급 데이터를 삭제했어요.");
    });
  }

  async function saveQuickClassCode() {
    if (!selected) return;
    const trimmed = editingClassCodeInput.trim().toUpperCase();
    if (trimmed.length < 4 || trimmed.length > 12) {
      setError("학급 코드는 4~12자리 영문 대소문자나 숫자여야 해요.");
      return;
    }
    await task(async () => {
      const result = await call<
        object,
        { classId: string; name: string; schoolYear: number; gradeBand: string; classCode: string }
      >("updateClassInfo", {
        classId: selected.classId,
        name: selected.name,
        schoolYear: selected.schoolYear,
        gradeBand: selected.gradeBand,
        classCode: trimmed,
        requestId: crypto.randomUUID(),
      });
      const updatedSelected = { ...selected, classCode: result.classCode || trimmed };
      setSelected(updatedSelected);
      const updatedClasses = classesRef.current.map((item) =>
        item.classId === selected.classId ? { ...item, classCode: result.classCode || trimmed } : item,
      );
      classesRef.current = updatedClasses;
      setClasses(updatedClasses);
      setIsEditingClassCode(false);
      setNotice(`학급 코드를 ${result.classCode || trimmed}(으)로 변경했어요.`);
    });
  }

  async function registerBatchStudents(names: string[]) {
    if (!selected || !names.length) return;
    if (members.length + names.length > 40) {
      setError("한 학급에는 최대 40명까지 등록할 수 있어요.");
      return;
    }
    await task(async () => {
      const result = await call<object, { students: Card[]; requiresCredentialRotation: boolean }>("registerStudents", {
        classId: selected.classId,
        displayNames: names,
        requestId: crypto.randomUUID(),
      });
      await loadTeacher();
      await selectClass(selected.classId, teacherPage, false);
      await loadCardCodes();
      setNotice(
        result.requiresCredentialRotation
          ? `${names.length}명의 학생을 등록했어요.`
          : `${names.length}명의 학생을 등록하고 4자리 카드를 만들었어요.`,
      );
    });
  }

  async function print(cardsToPrint: Card[]) {
    if (!cardsToPrint.length) return;
    const printGeneration = generation.current;
    const entryUrl = new URL("/student", window.location.origin).href;
    let qrDataUrl: string;
    try {
      const QRCode = (await import("qrcode")).default;
      qrDataUrl = await QRCode.toDataURL(entryUrl, {errorCorrectionLevel:"M", margin:4, width:300});
      const image = new Image();
      image.src = qrDataUrl;
      await image.decode();
    } catch {
      throw new Error("입장 QR을 만들지 못했어요. 다시 출력해 주세요.");
    }
    if (printGeneration !== generation.current) return;
    document.body.classList.add("is-printing-cards");
    flushSync(() => setPrintSheet({cards:cardsToPrint, qrDataUrl, entryUrl}));
    window.setTimeout(() => {
      window.print();
    }, 150);
  }

  function closePrintSheet() {
    document.body.classList.remove("is-printing-cards");
    setPrintSheet(null);
  }

  async function batchReissue(studentUids: string[]) {
    if (!selected || !studentUids.length) return;
    setConfirmBatchReissue(null);
    await task(async () => {
      const result = await call<
        object,
        { reissuedCount: number; cards: Array<{ studentUid: string; displayName: string; cardCode: string }> }
      >("reissueStudentCards", {
        classId: selected.classId,
        studentUids,
        requestId: crypto.randomUUID(),
      });
      setMembers((old) =>
        old.map((m) => (studentUids.includes(m.studentUid) ? { ...m, printableCardAvailable: true } : m)),
      );
      setCardCodes((old) => {
        const next = { ...old };
        for (const card of result.cards) {
          next[card.studentUid] = card.cardCode;
        }
        return next;
      });
      setNotice(`${result.reissuedCount}명 학생의 카드를 4자리 새 코드로 재발급했어요.`);
    });
  }

  async function preparePrint(studentUids: string[]) {
    if (!selected || !studentUids.length) return;
    await task(async () => {
      const result = await call<object, {cards: Card[]; missingStudentUids: string[]}>("getPrintableCards",
        {classId: selected.classId, studentUids});
      if (result.missingStudentUids.length) {
        setPendingPrint({studentUids, missingStudentUids: result.missingStudentUids});
      } else {
        await print(result.cards);
      }
    });
  }

  async function reissueAndPrint() {
    if (!selected || !pendingPrint) return;
    const target = pendingPrint;
    setPendingPrint(null);
    await task(async () => {
      await call<object, object>("reissueMissingCards", {classId: selected.classId,
        studentUids: target.missingStudentUids, requestId: crypto.randomUUID()});
      setMembers((old) => old.map((member) => target.missingStudentUids.includes(member.studentUid)
        ? {...member, printableCardAvailable: true} : member));
      const result = await call<object, {cards: Card[]; missingStudentUids: string[]}>("getPrintableCards",
        {classId: selected.classId, studentUids: target.studentUids});
      if (result.missingStudentUids.length) throw new Error("카드 준비가 끝나지 않았어요. 다시 출력해 주세요.");
      await print(result.cards);
      setNotice("새 카드로 발급했어요. 이전 카드는 사용할 수 없어요.");
    });
  }

  const activeMemberUids = members.filter((member) => member.accessStatus === "active")
    .map((member) => member.studentUid);
  const loadCardCodes = useCallback(async () => {
    if (!selected || teacherPage !== "students" || role !== "teacher") return;
    const studentUids = members.filter((member) => member.accessStatus === "active")
      .map((member) => member.studentUid);
    const version = ++cardReadVersion.current;
    setCardCodes({}); setCardCodesHidden(false); setCardCodesError(false);
    if (cardCodeTimeout.current !== null) window.clearTimeout(cardCodeTimeout.current);
    if (!studentUids.length) return;
    setCardCodesLoading(true);
    try {
      const result = await call<object, {cards: Card[]; missingStudentUids: string[]}>("getPrintableCards",
        {classId: selected.classId, studentUids});
      if (version !== cardReadVersion.current || document.visibilityState !== "visible") return;
      setCardCodes(Object.fromEntries(result.cards.map((card) => [card.studentUid, card.cardCode])));
      cardCodeTimeout.current = window.setTimeout(() => {
        cardReadVersion.current++; setCardCodes({}); setCardCodesHidden(true);
      }, 5 * 60_000);
    } catch {
      if (version === cardReadVersion.current) setCardCodesError(true);
    } finally {
      if (version === cardReadVersion.current) setCardCodesLoading(false);
    }
  }, [selected?.classId, teacherPage, role, members]);
  useEffect(() => {
    if (teacherPage === "students" && selected && role === "teacher") void loadCardCodes();
    else {cardReadVersion.current++; setCardCodes({}); setCardCodesLoading(false);}
    const hide = () => {if (document.visibilityState !== "visible") {
      cardReadVersion.current++; setCardCodes({}); setCardCodesHidden(true); setCardCodesLoading(false);
      if (cardCodeTimeout.current !== null) window.clearTimeout(cardCodeTimeout.current);
    }};
    document.addEventListener("visibilitychange", hide);
    return () => {document.removeEventListener("visibilitychange", hide);
      if (cardCodeTimeout.current !== null) window.clearTimeout(cardCodeTimeout.current);};
  }, [loadCardCodes, teacherPage, selected?.classId, role]);
  const filteredMembers = members.filter((member) => member.displayName.includes(memberSearch)
    && (memberFilter === "all" || member.accessStatus === memberFilter));

  return <div className={`app-shell${role === "student" ? " student-app" : ""}`}>
    <div className="topbar-surface no-print">
      <header className="topbar">
        <a className="brand" href={role === "teacher" ? "/teacher" : "/student"} onClick={(event) => { event.preventDefault();
          if (role === "teacher") openClasses();
          else if (role === "student") openStudentPage("today"); else navigate("student");
        }}><span className="brand-icon" aria-hidden="true">✉️</span> <span>우리 반 비밀친구</span></a>
        {role === "none" && <nav className="service-switch" aria-label="서비스 선택">
          <button type="button" className={route === "student" ? "nav-active" : "nav-link"} aria-pressed={route === "student"} onClick={() => navigate("student")}>학생 입장</button>
          <button type="button" className={route === "teacher" ? "nav-active" : "nav-link"} aria-pressed={route === "teacher"} onClick={() => navigate("teacher")}>선생님 방</button>
        </nav>}
        {role !== "none" && <div className="topbar-actions">
          {role === "student" && <button className="small outline" onClick={() => openStudentPage("help")}>선생님 도움</button>}
          <button className="small outline" onClick={() => void exit()}>{role === "teacher" ? "로그아웃" : "활동 마치기"}</button>
        </div>}
      </header>
    </div>

    <main className="content no-print">
      {error && <div className="message error" role="alert">{error}</div>}
      {notice && <div className="message success" role="status">{notice}</div>}
      {loading ? <section className="panel centered"><p>입장 정보를 확인하고 있어요…</p></section> :
        role === "student" ? <section className="student-grid student-shell">
          <nav className="student-nav segmented-track" aria-label="학생 활동 메뉴">{([{id:"today",label:"홈"},{id:"missions",label:"미션"},{id:"mail",label:"우편함"},{id:"community",label:"우리 반"}] as const).map((item) =>
            <a key={item.id} href={item.id === "today" ? "/student" : `/student/${item.id}`} aria-current={studentPage === item.id ? "page" : undefined} onClick={(event) => {event.preventDefault();openStudentPage(item.id);}}>{item.label}</a>)}</nav>
          {studentPage === "today" && <><div className="student-page-header"><div><span className="context-badge">{home?.className}</span><h1 className="student-page-title" tabIndex={-1}>안녕, {home?.displayName}!</h1><p className="student-intro">오늘도 친구를 위한 작은 배려에 편하게 참여해요.</p></div><button className="small outline" disabled={busy} onClick={() => void task(loadStudent)}>새 소식 확인</button></div>
            {home?.round ? <StudentRound key={home.round.roundId} roundId={home.round.roundId} status={home.round.status} refreshVersion={studentRefreshVersion} view="home" gradeBand={home.gradeBand} onNavigate={openStudentPage} missionUi={studentMissionUi} onMissionUiChange={setStudentMissionUi} mailDraftRef={studentMailDraft} />
              : <section className="panel empty"><h2>선생님이 다음 활동을 준비하고 있어요</h2><p>새 활동이 시작되면 여기서 확인할 수 있어요.</p><button className="outline" onClick={() => openStudentPage("history")}>지난 활동 보기</button></section>}</>}
          {studentPage === "missions" && <><div className="student-page-header"><div><span className="context-badge">나의 활동</span><h1 className="student-page-title" tabIndex={-1}>미션</h1><p className="student-intro">원하는 미션을 골라 해 보거나 부담 없이 쉬어 갈 수 있어요.</p></div></div>{home?.round ? <StudentRound key={home.round.roundId} roundId={home.round.roundId} status={home.round.status} refreshVersion={studentRefreshVersion} view="missions" gradeBand={home.gradeBand} missionUi={studentMissionUi} onMissionUiChange={setStudentMissionUi} mailDraftRef={studentMailDraft} /> : <section className="panel"><p>진행 중인 시즌이 없어요. 홈에서 새 소식을 확인해 주세요.</p></section>}</>}
          {studentPage === "mail" && <><div className="student-page-header"><div><span className="context-badge">익명 응원 대화</span><h1 className="student-page-title" tabIndex={-1}>우편함</h1><p className="student-intro">내가 맡은 친구와 나를 맡은 친구, 두 대화가 따로 보관돼요.</p></div></div>{home?.round ? <StudentRound key={home.round.roundId} roundId={home.round.roundId} status={home.round.status} refreshVersion={studentRefreshVersion} view="mail" gradeBand={home.gradeBand} missionUi={studentMissionUi} onMissionUiChange={setStudentMissionUi} mailDraftRef={studentMailDraft} /> : <section className="panel"><p>진행 중인 활동이 없어요. 지난 활동에서 받은 쪽지를 확인할 수 있어요.</p></section>}</>}
          {studentPage === "community" && <><div className="student-page-header"><div><span className="context-badge">{home?.className}</span><h1 className="student-page-title" tabIndex={-1}>우리 반</h1><p className="student-intro">교실에서 실천할 수 있는 배려 아이디어와 선생님 안내를 확인해요.</p></div></div>{home?.round ? <StudentCommunity key={home.round.roundId} roundId={home.round.roundId} /> : <section className="panel"><p>진행 중인 시즌이 없어요. 새 시즌이 시작되면 이곳에서 활동 아이디어를 볼 수 있어요.</p></section>}</>}
          {studentPage === "help" && <><div className="student-page-header"><div><span className="context-badge">안전·도움 센터</span><h1 className="student-page-title" tabIndex={-1}>선생님 도움</h1><p className="student-intro">불편하거나 걱정되는 점은 언제든 비공개로 선생님께 알릴 수 있어요.</p></div></div>{home?.round && <StudentRound key={home.round.roundId} roundId={home.round.roundId} status={home.round.status} refreshVersion={studentRefreshVersion} view="help" gradeBand={home.gradeBand} missionUi={studentMissionUi} onMissionUiChange={setStudentMissionUi} mailDraftRef={studentMailDraft} />}
            <StudentRights /></>}
          {studentPage === "history" && <><div className="student-page-header"><div><span className="context-badge">활동 보관함</span><h1 className="student-page-title" tabIndex={-1}>지난 활동</h1><p className="student-intro">예전 시즌의 공개 결과와 미션·쪽지 기록을 돌아볼 수 있어요.</p></div></div><section className="panel"><div className="panel-section-head"><h2>시즌 목록</h2><p className="field-help">예전 활동과 쪽지는 각 활동 안에서만 볼 수 있어요.</p></div>{historyRounds.length === 0 ? <p className="muted">아직 지난 활동이 없어요.</p> : <div className="round-list">{historyRounds.map((item) => <button key={item.roundId} className="outline" aria-expanded={openHistoryRoundId === item.roundId} onClick={() => setOpenHistoryRoundId((old) => old === item.roundId ? null : item.roundId)}><strong>{item.title}</strong><small>{item.startsAt ? `${koreaDateLabel(item.startsAt)} 시작 · ` : ""}{item.status === "archived" ? "보관됨" : "친구 공개됨"} · {openHistoryRoundId === item.roundId ? "닫기" : "기록 보기"}</small></button>)}</div>}</section>
            {openHistoryRoundId && <StudentRound key={openHistoryRoundId} roundId={openHistoryRoundId} status="archived" refreshVersion={studentRefreshVersion} view="history" gradeBand={home?.gradeBand} missionUi={studentMissionUi} onMissionUiChange={setStudentMissionUi} mailDraftRef={studentMailDraft} />}</>}
        </section> : route === "student" && role === "none" ? <section className="entry-layout">
          <div className="hero">
            <span className="eyebrow">초등 학급 마니또 · 학생용</span>
            <h1>비밀친구 작전,<br />시작해 볼까요?</h1>
            <p>선생님께 받은 학급 코드와 내 입장 카드 코드를 적어 주세요.</p>
            <ul className="hero-highlights" aria-label="활동 안내">
              <li><strong>오늘의 미션</strong> 교실에서 바로 해 볼 수 있는 따뜻한 배려 미션</li>
              <li><strong>비밀 우편함</strong> 이름 없이 주고받는 안전한 응원 쪽지</li>
            </ul>
          </div>
          <form className="panel entry-form" onSubmit={(event) => { event.preventDefault(); void task(async () => {
            await studentLogin(classCodeInput.trim().toUpperCase(), cardCodeInput.trim().toUpperCase(), rememberStudent);
            setCardCodeInput("");
          }); }}>
            <div className="entry-form-head">
              <span className="context-badge">입장 카드 로그인</span>
              <h2>내 카드로 입장하기</h2>
            </div>
            <label htmlFor="student-class-code">학급 코드
              <input id="student-class-code" autoComplete="off" maxLength={12} value={classCodeInput} onChange={(event) => setClassCodeInput(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="선생님이 알려준 학급 코드" required />
            </label>
            <div className="field-group">
              <div className="field-label-row">
                <label htmlFor="student-card-code">개인 카드 코드</label>
                <button type="button" className="small outline inline-toggle" onClick={() => setShowCardInput((value) => !value)}>{showCardInput ? "코드 가리기" : "코드 보기"}</button>
              </div>
              <input id="student-card-code" type={showCardInput ? "text" : "password"} autoComplete="off" maxLength={16} value={cardCodeInput} onChange={(event) => setCardCodeInput(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))} placeholder="카드에 적힌 4자리 코드 (예: 7K9X)" required />
            </div>
            <div className="checkbox-row remember-row">
              <label htmlFor="student-remember-me" className="checkbox-label">
                <input id="student-remember-me" type="checkbox" checked={rememberStudent} onChange={(e) => setRememberStudent(e.target.checked)} />
                <span>이 기기에서 로그인 기억하기 (자동 로그인)</span>
              </label>
            </div>
            <p className="field-help">공용 컴퓨터에서는 체크를 해제해 주세요. 창을 닫으면 자동으로 로그아웃돼요.</p>
            <button className="wide primary-cta" disabled={busy}>{busy ? "확인 중…" : "입장하기"}</button>
            <p className="help">카드를 잃어버렸거나 입장이 안 되면 선생님께 말씀해 주세요. 이름만으로는 입장할 수 없어요.</p>
          </form>
        </section> : route === "teacher" && role === "none" ? <section className="entry-layout">
          <div className="hero teacher-hero">
            <span className="eyebrow">초등 학급 마니또 · 교사용</span>
            <h1>우리 반의 작은 배려를<br />준비해요</h1>
            <p>선생님 Google 계정으로 학급을 만들고 입장 카드와 시즌을 안전하게 운영할 수 있어요.</p>
            <ul className="hero-highlights" aria-label="교사 기능 안내">
              <li><strong>간편한 카드 발급</strong> 이메일·휴대전화 없이 학급 코드와 개인 카드로 학생 참여</li>
              <li><strong>안전한 모니터링</strong> 도움 요청 우선 확인, 쪽지 숨김, 교사 승인 후 정체 공개</li>
            </ul>
          </div>
          <div className="panel entry-form">
            <div className="entry-form-head">
              <span className="context-badge">교사 인증</span>
              <h2>선생님 로그인</h2>
            </div>
            <p>Google 계정으로 로그인하면 바로 학급을 만들고 운영할 수 있어요.</p>
            <button className="wide primary-cta" disabled={busy} onClick={() => void task(teacherLogin)}>{busy ? "로그인 중…" : "Google로 로그인"}</button>
            <button type="button" className="wide outline" disabled={busy} onClick={() => void task(teacherLoginRedirect)}>팝업이 안 열리면 현재 창에서 로그인</button>
          </div>
        </section> : role === "teacher" && teacher?.status !== "verified" ? <section className="panel centered">
          <div className="big-icon">🔒</div><h1>{teacher?.status === "suspended" ? "이용이 중지됐어요" : "선생님 확인을 기다리고 있어요"}</h1>
          <p>학급 정보는 확인이 끝난 계정에서만 볼 수 있어요.</p>
          <button onClick={() => void task(async () => { await auth.currentUser?.getIdToken(true); await loadTeacher(); })}>상태 다시 확인</button>
        </section> : role === "teacher" ? <section className="teacher-layout">
          {teacherPage === "classes" || !selected ? <section className="panel"><div className="page-header"><div><span className="context-badge">교사 대시보드</span><h1>내 학급</h1><p>운영할 학급을 선택하거나 새 학급을 만들어 주세요.</p></div><button onClick={() => setShowCreateClass((value) => !value)}>{showCreateClass ? "만들기 닫기" : "새 학급 만들기"}</button></div>
            {classes.length === 0 ? <p className="muted">아직 만든 학급이 없어요.</p> : <ul className="class-list">{classes.map((item) => <li key={item.classId} className="class-card-item">
              <div className="class-card-info" role="button" tabIndex={0} onClick={() => void selectClass(item.classId)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") void selectClass(item.classId); }}>
                <strong className="class-card-name">{item.name}</strong>
                <div className="class-card-meta">
                  <span>{item.schoolYear}학년도</span>
                  <span className="dot-sep">·</span>
                  <span>{item.memberCount}명</span>
                  <span className="class-code-badge">코드 {item.classCode}</span>
                </div>
              </div>
              <div className="class-card-actions">
                <button type="button" className="class-enter-btn" disabled={busy} onClick={() => void selectClass(item.classId)}>입장하기 →</button>
                <button type="button" className="class-delete-btn" disabled={busy} onClick={(e) => { e.stopPropagation(); setClassToDelete(item); }}>삭제</button>
              </div>
            </li>)}</ul>}
            {showCreateClass && <form onSubmit={(event) => void createClass(event)} className="stack teacher-page-form sub-panel"><h2>새 학급 만들기</h2><label>학급 이름<input value={newClassName} maxLength={40} onChange={(event) => setNewClassName(event.target.value)} required /></label>
              <label>학급 코드 (선택)<input value={newClassCode} maxLength={12} onChange={(event) => setNewClassCode(event.target.value.toUpperCase())} placeholder="미입력 시 6자리 영문·숫자 자동 생성 (예: SUN2026)" /><small className="field-help">선생님이 기억하기 쉬운 4~12자 영문 대소문자·숫자를 직접 지정할 수 있어요.</small></label>
              <label>학년도<input type="number" value={newYear} onChange={(event) => setNewYear(Number(event.target.value))} required /></label>
              <label>학년군<select value={newGrade} onChange={(event) => setNewGrade(event.target.value)}><option value="lower">1~2학년</option><option value="middle">3~4학년</option><option value="upper">5~6학년</option></select></label>
              <button disabled={busy}>학급 만들기</button></form>}</section> : <div className="teacher-shell">
            <nav className="teacher-sidebar" aria-label="학급 메뉴"><span className="sidebar-label">학급 운영 메뉴</span>{teacherPages.map((page) => <button key={page.id} aria-current={teacherPage === page.id ? "page" : undefined} onClick={() => openTeacherPage(page.id)}>{page.label}</button>)}</nav>
            <div className="teacher-main">
              <div className="teacher-context"><div><span className="context-badge">현재 선택 학급</span><h1>{selected.name}</h1><p>{selected.schoolYear}학년도 · {selected.gradeBand === "lower" ? "1~2학년" : selected.gradeBand === "middle" ? "3~4학년" : "5~6학년"} · 학생 {membersLoading && members.length === 0 ? selected.memberCount : members.length}명</p></div><button className="small outline" onClick={openClasses}>학급 바꾸기</button></div>
              <details ref={mobileTeacherMenu} className="mobile-teacher-menu"><summary>학급 메뉴 · {teacherPages.find((page) => page.id === teacherPage)?.label}</summary><nav aria-label="학급 메뉴">{teacherPages.map((page) => <button key={page.id} aria-current={teacherPage === page.id ? "page" : undefined} onClick={() => openTeacherPage(page.id)}>{page.label}</button>)}</nav></details>
              {teacherPage === "students" && <section className="panel student-cards-panel"><div className="page-header"><div><h2>입장 카드</h2><p>학생 등록과 입장 카드를 이곳에서 관리해요.</p></div></div>
                <div className="class-code">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: "6px" }}>
                    <span>학급 코드</span>
                    {!isEditingClassCode && (
                      <button
                        type="button"
                        className="small outline"
                        disabled={busy}
                        onClick={() => {
                          setIsEditingClassCode(true);
                          setEditingClassCodeInput(selected.classCode || "");
                        }}
                      >
                        코드 수정
                      </button>
                    )}
                  </div>
                  {isEditingClassCode ? (
                    <form
                      style={{ display: "flex", gap: "6px", alignItems: "center", width: "100%", margin: "6px 0" }}
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveQuickClassCode();
                      }}
                    >
                      <input
                        style={{ fontSize: "1.1rem", fontWeight: "700", textTransform: "uppercase", padding: "6px 10px" }}
                        maxLength={12}
                        value={editingClassCodeInput}
                        onChange={(e) => setEditingClassCodeInput(e.target.value.toUpperCase())}
                        placeholder="4~12자리 영문/숫자"
                        required
                        autoFocus
                      />
                      <button type="submit" className="small primary-cta" disabled={busy || !editingClassCodeInput.trim()}>
                        저장
                      </button>
                      <button type="button" className="small outline" disabled={busy} onClick={() => setIsEditingClassCode(false)}>
                        취소
                      </button>
                    </form>
                  ) : (
                    <strong>{selected.classCode || "확인 중…"}</strong>
                  )}
                  <small>학생이 로그인할 때 사용하는 코드예요. (4~12자 영문/숫자)</small>
                </div>

                <div style={{ margin: "14px 0" }}>
                  <button type="button" className={members.length === 0 ? "primary-cta" : "outline"} onClick={() => setShowCardImporter((v) => !v)}>
                    {showCardImporter ? "명단 등록 닫기" : "📋 엑셀·PDF·한글·복사로 학생 명단 등록하기"}
                  </button>
                </div>
                {showCardImporter && (
                  <StudentRosterImporter
                    busy={busy}
                    onCancel={() => setShowCardImporter(false)}
                    onRegister={async (names) => {
                      await registerBatchStudents(names);
                      setShowCardImporter(false);
                    }}
                  />
                )}

                {members.length > 0 ? <details className="student-registration"><summary>직접 이름 적어 등록하기</summary><form onSubmit={(event) => void register(event)} className="stack teacher-page-form"><label>이름을 한 줄에 한 명씩<textarea rows={4} value={namesInput} onChange={(event) => setNamesInput(event.target.value)} placeholder={"가람\n나래"} /></label><button disabled={busy}>학생 등록하고 카드 만들기</button></form></details>
                  : <form onSubmit={(event) => void register(event)} className="stack teacher-page-form"><h3>직접 이름 적어 등록하기</h3><label>이름을 한 줄에 한 명씩<textarea rows={4} value={namesInput} onChange={(event) => setNamesInput(event.target.value)} placeholder={"가람\n나래"} /></label><button disabled={busy}>학생 등록하고 카드 만들기</button></form>}
                <div className="card-list-heading"><div><h3>학생 명단 · {membersLoading && members.length === 0 ? selected.memberCount : members.length}명</h3><p className="field-help">출력할 학생을 선택하거나 학급 전체 카드를 바로 출력하세요.</p></div>
                  <div className="action-row">
                    <button type="button" disabled={busy || activeMemberUids.length === 0} onClick={() => void preparePrint(activeMemberUids)}>전체 카드 {activeMemberUids.length}장 출력</button>
                    <button type="button" className="outline" disabled={busy || activeMemberUids.length === 0} onClick={() => setConfirmBatchReissue({ studentUids: activeMemberUids, label: `전체 학생 ${activeMemberUids.length}명` })}>4자리 코드로 전체 재발급</button>
                  </div>
                </div>
                <div className="card-code-notice"><span>개인 코드는 선생님에게만 표시돼요. 다른 화면으로 이동하거나 5분이 지나면 가려집니다.</span><button type="button" className="small outline" disabled={cardCodesLoading || activeMemberUids.length === 0} onClick={() => void loadCardCodes()}>{cardCodesLoading ? "코드 확인 중…" : cardCodesHidden ? "코드 다시 보기" : "코드 새로고침"}</button></div>
                {cardCodesError && <p className="message error" role="alert">개인 코드를 불러오지 못했어요. 코드 새로고침을 눌러 다시 시도해 주세요.</p>}
                {Object.values(cardCodes).some((code) => code && code.length > 4) && (
                  <div className="card-code-notice legacy-code-alert" style={{ background: "#fef3c7", borderColor: "#f59e0b", color: "#92400e", margin: "8px 0" }}>
                    <span>⚠️ 이전에 발급된 긴 12자리 구 코드를 사용하는 학생이 있어요. <strong>'4자리 코드로 전체 재발급'</strong>을 누르면 4자리 새 코드로 즉시 교체됩니다.</span>
                  </div>
                )}
                <div className="page-actions card-filters"><label>이름 검색<input type="search" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} /></label><label>입장 상태<select value={memberFilter} onChange={(event) => setMemberFilter(event.target.value)}><option value="all">전체</option><option value="active">입장 가능</option><option value="blocked">입장 불가</option></select></label></div>
                <div className="card-selection-toolbar">
                  <button type="button" className="small outline" disabled={busy || activeMemberUids.length === 0} onClick={() => setSelectedCardUids(activeMemberUids)}>전체 선택</button>
                  <button type="button" className="small outline" disabled={busy || selectedCardUids.length === 0} onClick={() => setSelectedCardUids([])}>선택 해제</button>
                  <button type="button" disabled={busy || selectedCardUids.length === 0} onClick={() => void preparePrint(selectedCardUids)}>선택한 카드 {selectedCardUids.length}장 출력</button>
                  <button type="button" className="small outline" disabled={busy || selectedCardUids.length === 0} onClick={() => setConfirmBatchReissue({ studentUids: selectedCardUids, label: `선택한 학생 ${selectedCardUids.length}명` })}>선택한 카드 4자리로 재발급</button>
                </div>
                {membersLoading && members.length === 0 ? <p role="status">학생 명단을 불러오는 중이에요…</p> : members.length === 0 ? <p className="muted">아직 등록한 학생이 없어요. 학생을 등록하면 입장 카드를 출력할 수 있어요.</p> :
                  filteredMembers.length === 0 ? <p className="muted">조건에 맞는 학생이 없어요.</p> :
                    <ol className="student-card-list">{filteredMembers.map((member) => {
                      const checked = selectedCardUids.includes(member.studentUid);
                      const isEditing = editingMemberUid === member.studentUid;
                      return <li key={member.studentUid} className={`student-card-row${checked ? " is-selected" : ""}`}>
                        <label className="student-card-choice"><input type="checkbox" checked={checked} disabled={member.accessStatus !== "active"} onChange={(event) => setSelectedCardUids((old) => event.target.checked ? [...old, member.studentUid] : old.filter((uid) => uid !== member.studentUid))} /><span className="student-card-number">{members.indexOf(member) + 1}</span><strong>{member.displayName}</strong></label>
                        {isEditing ? <div className="action-row"><input aria-label="새 학생 이름" value={editingMemberName} maxLength={20} onChange={(event) => setEditingMemberName(event.target.value)} /><button type="button" className="small primary-cta" disabled={busy || !editingMemberName.trim()} onClick={() => void saveMemberName(member)}>저장</button><button type="button" className="small outline" disabled={busy} onClick={() => { setEditingMemberUid(null); setEditingMemberName(""); }}>취소</button></div>
                          : <div className="student-card-code">개인 코드 <code>{member.accessStatus !== "active" ? "입장 불가" : cardCodes[member.studentUid] ?? (cardCodesLoading ? "확인 중…" : cardCodesHidden ? "가려짐" : member.printableCardAvailable ? "코드 확인 필요" : "이전 카드 · 재발급 필요")}</code></div>}
                        <div className="student-card-actions"><span className="student-card-status">{member.accessStatus !== "active" ? "입장 불가" : member.printableCardAvailable ? "입장 가능 · 출력 가능" : "입장 가능 · 첫 출력 때 재발급"}</span>
                          {!isEditing && <button type="button" className="small outline" disabled={busy} onClick={() => { setEditingMemberUid(member.studentUid); setEditingMemberName(member.displayName); }}>이름 수정</button>}
                          <button type="button" className="small outline" disabled={busy || member.accessStatus !== "active"} onClick={() => setConfirmMember({member,action:"rotate"})}>재발급</button>
                          <button type="button" className="small outline" disabled={busy} onClick={() => member.accessStatus === "active" ? setConfirmMember({member,action:"block"}) : void changeAccess(member)}>{member.accessStatus === "active" ? "입장 차단" : "차단 해제"}</button>
                          <button type="button" className="small danger outline" disabled={busy} onClick={() => setConfirmMember({member,action:"remove"})}>삭제</button></div>
                      </li>;
                    })}</ol>}
              </section>}
              {(["overview","rounds","status","history"] as TeacherPage[]).includes(teacherPage) && <TeacherRounds key={selected.classId} classId={selected.classId} gradeBand={selected.gradeBand} members={members} view={teacherPage as "overview" | "rounds" | "status" | "history"} statusTarget={teacherStatusTarget} onNavigate={openTeacherPage} onDirtyChange={(value) => { roundDirty.current = value; }} onRegisterStudents={registerBatchStudents} />}
              {teacherPage === "assignments" && <TeacherAssignments key={selected.classId} classId={selected.classId} />}
              {teacherPage === "settings" && <><section className="panel"><form onSubmit={(event) => void updateClassBasicInfo(event)} className="stack teacher-page-form"><h2>학급 기본 정보 수정</h2><p className="field-help">학급 이름 오타를 고치거나 학급 코드·학년도·학년군(기본 미션 40개 구성 기준)을 수정할 수 있어요.</p><div className="form-grid"><label>학급 이름<input value={editClassName} maxLength={40} onChange={(event) => setEditClassName(event.target.value)} required /></label><label>학급 코드<input value={editClassCode} maxLength={12} onChange={(event) => setEditClassCode(event.target.value.toUpperCase())} placeholder="예: SUN2026" required /></label><label>학년도<input type="number" value={editClassYear} onChange={(event) => setEditClassYear(Number(event.target.value))} required /></label><label>학년군<select value={editClassGrade} onChange={(event) => setEditClassGrade(event.target.value)}><option value="lower">1~2학년</option><option value="middle">3~4학년</option><option value="upper">5~6학년</option></select></label></div><p className="field-help">학급 코드를 바꾸면 기존에 인쇄한 카드의 학급 코드도 변경되므로 학생들에게 바뀐 코드를 안내해 주세요.</p><div className="action-row"><button type="submit" disabled={busy || !editClassName.trim()}>학급 정보 저장</button></div></form></section><section className="panel"><h2>정보 요청·삭제</h2><p>학생이 보낸 정보 열람·정정·삭제 요청을 확인하고, 학급 전체가 더 이상 필요 없을 때 데이터를 삭제하는 곳이에요. 학생 요청은 접수만 되며 이 화면에서 자동으로 정정·삭제되지는 않아요. 개별 학생의 이름 수정이나 삭제는 입장 카드 메뉴에서 바로 처리할 수 있어요.</p><div className="action-row"><button type="button" className="small outline" onClick={() => openTeacherPage("students")}>입장 카드(학생 이름 수정·삭제)로 이동</button></div></section><TeacherRights classId={selected.classId} /><section className="panel"><h2>학급 데이터 삭제</h2><p>모든 시즌을 보관하거나 취소(또는 삭제)한 뒤 학급, 학생 카드와 활동 기록을 영구 삭제할 수 있어요. 되돌릴 수 없습니다.</p><label>확인을 위해 학급 이름 입력<input value={deleteName} onChange={(e) => setDeleteName(e.target.value)} /></label><button className="danger" disabled={busy || deleteName !== selected.name} onClick={() => void deleteClass()}>학급 데이터 영구 삭제</button></section></>}
            </div></div>}
          {classToDelete && <ConfirmDialog title={`${classToDelete.name} 학급을 삭제할까요?`} detail={`${classToDelete.name} 학급의 학생 명단, 입장 카드, 시즌과 쪽지 활동 기록이 완전히 삭제되며 복구할 수 없습니다.`} confirmLabel="학급 영구 삭제" busy={busy} onCancel={() => setClassToDelete(null)} onConfirm={async () => { const target = classToDelete; setClassToDelete(null); await task(async () => { await call<object, object>("deleteClassData", { classId: target.classId, requestId: crypto.randomUUID() }); if (selected?.classId === target.classId) { setSelected(null); setMembers([]); } await loadTeacher(); setNotice(`${target.name} 학급 데이터를 삭제했어요.`); }); }} />}
          {confirmMember && <ConfirmDialog title={confirmMember.action === "rotate" ? "입장 카드를 재발급하고 출력할까요?" : confirmMember.action === "remove" ? "이 학생을 명단에서 삭제할까요?" : "학생 입장을 차단할까요?"} detail={confirmMember.action === "rotate" ? `${confirmMember.member.displayName} 학생의 이전 카드는 즉시 사용할 수 없어요. 새 카드 한 장을 이어서 출력합니다.` : confirmMember.action === "remove" ? `${confirmMember.member.displayName} 학생의 입장 카드와 명단 정보를 삭제합니다. 진행 중인 시즌에 참여하고 있는 학생은 먼저 시즌을 중지하거나 학생 참여를 중단해야 삭제할 수 있어요.` : `${confirmMember.member.displayName} 학생은 차단 해제 전까지 입장할 수 없어요.`} confirmLabel={confirmMember.action === "rotate" ? "재발급 후 출력" : confirmMember.action === "remove" ? "학생 삭제" : "입장 차단"} busy={busy} onCancel={() => setConfirmMember(null)} onConfirm={() => { const target = confirmMember; setConfirmMember(null); if (target.action === "rotate") void rotate(target.member); else if (target.action === "remove") void removeMember(target.member); else void changeAccess(target.member); }} />}
          {confirmBatchReissue && <ConfirmDialog title={`${confirmBatchReissue.label}의 카드를 4자리 새 코드로 재발급할까요?`} detail="새로운 4자리 코드(예: 7K9X)가 즉시 발급됩니다. 대상 학생의 이전 카드와 로그인 세션은 즉시 무효화되므로 새 카드를 인쇄하여 배부해 주세요." confirmLabel="4자리 새 코드로 재발급" busy={busy} onCancel={() => setConfirmBatchReissue(null)} onConfirm={() => void batchReissue(confirmBatchReissue.studentUids)} />}
          {pendingPrint && <ConfirmDialog title="기존 카드를 새로 발급할까요?" detail={`선택한 학생 중 ${pendingPrint.missingStudentUids.length}명의 기존 카드 코드는 다시 출력할 수 없어요. 새로 발급하면 그 학생들의 이전 카드와 로그인 세션은 즉시 무효화됩니다. 새 카드를 이어서 출력합니다.`} confirmLabel="재발급 후 출력" busy={busy} onCancel={() => setPendingPrint(null)} onConfirm={() => void reissueAndPrint()} />}
        </section> : null}
    </main>

    {printSheet && selected && <div className="print-sheet-wrapper">
      <div className="print-controls-bar no-print">
        <div className="print-controls-info">
          <strong>🖨️ 입장 카드 인쇄 미리보기 ({printSheet.cards.length}장)</strong>
          <span>인쇄 창이 자동으로 열리지 않으면 [다시 인쇄하기]를 눌러주세요. 인쇄 후 [인쇄 완료 / 닫기]를 누르면 돌아갑니다.</span>
        </div>
        <div className="action-row">
          <button type="button" className="primary-cta" onClick={() => window.print()}>다시 인쇄하기</button>
          <button type="button" className="outline" onClick={closePrintSheet}>인쇄 완료 / 닫기</button>
        </div>
      </div>
      <div className="print-only">{printSheet.cards.map((card) => <div className="printed-card" key={card.studentUid}>
        <span className="printed-card-brand">💌 우리 반 비밀친구</span>
        <h1>{card.displayName} 입장 카드</h1>
        <div className="printed-card-entry"><img src={printSheet.qrDataUrl} alt="학생 입장 페이지 QR 코드" width="160" height="160" />
          <div><strong>QR로 입장 페이지 열기</strong><p>스캔한 뒤 아래 학급 코드와 내 카드 코드를 입력하세요.</p><p className="printed-card-url">QR을 쓸 수 없다면: {printSheet.entryUrl}</p></div></div>
        <div className="printed-card-codes"><p>학급 코드 <strong>{selected.classCode}</strong></p><p>내 카드 코드 <strong>{card.cardCode}</strong></p></div>
        <p className="printed-card-secret">내 카드 코드는 나만 써요. 친구에게 보여주지 마세요.</p>
      </div>)}</div>
    </div>}
  </div>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
