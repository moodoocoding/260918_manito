import {useCallback, useEffect, useRef, useState} from "react";
import {call} from "./firebase";

export type Student = {studentUid:string; displayName:string; participationStatus:string;
  completedMissions:number; totalMissions:number; sentMessages:number};
export type Detail = {studentUid:string; displayName:string;
  missions:Array<{missionId:string; text:string; status:"done"|"todo"|"skipped"}>;
  messages:Array<{messageId:string; direction:"sent"|"received"; senderName:string;
    receiverName:string; text:string; status:string; date:string}>};

const missionLabels = {done:"완료", todo:"아직 하지 않음", skipped:"쉬기"};
const fetchStatus = (classId:string,roundId:string) =>
  call<object,{students:Student[]}>("getTeacherStudentStatus",{classId,roundId});
const fetchDetail = (classId:string,roundId:string,studentUid:string) =>
  call<object,Detail>("getTeacherStudentDetail",{classId,roundId,studentUid});

export function TeacherStudentStatus({classId, roundId, loadStatus = fetchStatus, loadDetail = fetchDetail}: {
  classId:string; roundId:string;
  loadStatus?:(classId:string,roundId:string)=>Promise<{students:Student[]}>;
  loadDetail?:(classId:string,roundId:string,studentUid:string)=>Promise<Detail>;
}) {
  const [students,setStudents] = useState<Student[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [selected,setSelected] = useState<string|null>(null);
  const [detail,setDetail] = useState<Detail|null>(null);
  const [detailLoading,setDetailLoading] = useState(false);
  const [detailError,setDetailError] = useState("");
  const [detailSection,setDetailSection] = useState<"missions"|"messages">("missions");
  const detailRequest = useRef(0);
  const summaryRequest = useRef(0);
  const detailElement = useRef<HTMLElement|null>(null);
  const cardElements = useRef(new Map<string,HTMLButtonElement>());
  const load = useCallback(async () => {
    const version = ++summaryRequest.current;
    setLoading(true); setError("");
    try {
      const result = await loadStatus(classId,roundId);
      if (version === summaryRequest.current) setStudents(result.students);
    } catch {
      if (version === summaryRequest.current) setError("학생 상태를 불러오지 못했어요.");
    } finally {
      if (version === summaryRequest.current) setLoading(false);
    }
  },[classId,roundId,loadStatus]);
  useEffect(() => {
    setSelected(null); setDetail(null); detailRequest.current++;
    void load();
    return () => {summaryRequest.current++; detailRequest.current++;};
  },[load]);
  useEffect(() => {
    const hide = () => {if (document.visibilityState === "hidden") {
      detailRequest.current++; setSelected(null); setDetail(null); setDetailError("");
    }};
    document.addEventListener("visibilitychange",hide);
    return () => document.removeEventListener("visibilitychange",hide);
  },[]);
  useEffect(() => {
    if (!selected) return;
    detailElement.current?.scrollIntoView({block:"start"});
    const timer = window.setTimeout(() => {
      detailRequest.current++; setSelected(null); setDetail(null); setDetailError("");
    }, 5 * 60_000);
    return () => window.clearTimeout(timer);
  },[selected]);
  async function open(studentUid:string) {
    if (selected === studentUid) {
      detailRequest.current++; setSelected(null); setDetail(null); setDetailError("");
      requestAnimationFrame(() => cardElements.current.get(studentUid)?.focus());
      return;
    }
    const version = ++detailRequest.current;
    setSelected(studentUid); setDetail(null); setDetailError(""); setDetailLoading(true); setDetailSection("missions");
    try {
      const result = await loadDetail(classId,roundId,studentUid);
      if (version === detailRequest.current) setDetail(result);
    } catch {
      if (version === detailRequest.current) setDetailError("학생 기록을 불러오지 못했어요. 다시 열어 주세요.");
    } finally {
      if (version === detailRequest.current) setDetailLoading(false);
    }
  }
  return <section className="teacher-status-section" aria-label="학생별 상태">
    <div className="status-toolbar"><p className="field-help">이번 시즌의 지원용 기록이에요. 비교하거나 평가하는 수치로 사용하지 마세요.</p>
      <button type="button" className="small outline" onClick={() => void load()}>상태 새로고침</button></div>
    {loading && <p role="status">학생 상태를 불러오는 중이에요…</p>}
    {error && <p className="message error" role="alert">{error} <button className="small outline" onClick={() => void load()}>다시 시도</button></p>}
    {!loading && !error && students.length === 0 && <p className="muted">이 시즌에 참가한 학생이 없어요.</p>}
    {selected && <section ref={detailElement} id="teacher-student-detail" className="teacher-student-detail" aria-label="선택한 학생의 기록">
      <div className="section-heading"><h4>{detail?.displayName ?? students.find((item) => item.studentUid === selected)?.displayName}의 기록</h4>
        <button type="button" className="small outline" onClick={() => void open(selected)}>닫기</button></div>
      {detailLoading && <p role="status">기록을 불러오는 중이에요…</p>}
      {detailError && <p className="message error" role="alert">{detailError}</p>}
      {detail && <><div className="teacher-detail-tabs segmented-track" role="group" aria-label="학생 기록 종류">
        <button type="button" className={detailSection === "missions" ? "small is-active" : "small outline"}
          aria-pressed={detailSection === "missions"} onClick={() => setDetailSection("missions")}>미션 · {detail.missions.length}개</button>
        <button type="button" className={detailSection === "messages" ? "small is-active" : "small outline"}
          aria-pressed={detailSection === "messages"} onClick={() => setDetailSection("messages")}>쪽지 · {detail.messages.length}건</button>
      </div>
      {detailSection === "missions" && <>
        {detail.missions.length === 0 ? <p className="muted">저장된 미션이 없어요.</p> : <div className="teacher-status-missions">
          {(["done","todo","skipped"] as const).map((status) => <section key={status}>
            <h5>{missionLabels[status]} · {detail.missions.filter((item) => item.status === status).length}개</h5>
            {detail.missions.some((item) => item.status === status) && <ul>{detail.missions.filter((item) => item.status === status)
              .map((item) => <li key={item.missionId}>{item.text}</li>)}</ul>}
          </section>)}
        </div>}</>}
      {detailSection === "messages" && <>
        <p className="field-help">이 학생과 직접 주고받은 이번 시즌 쪽지 전체를 최신순으로 보여줘요. 이 열람은 기록됩니다.</p>
        {detail.messages.length === 0 ? <p className="muted">주고받은 쪽지가 없어요.</p> : <ol className="teacher-status-messages">
          {detail.messages.map((message) => <li key={message.messageId}>
            <div><strong>{message.direction === "sent" ? "보냄" : "받음"}</strong>
              <span>{message.senderName} → {message.receiverName}</span>
              <small>{message.date} · {message.status === "moderated" ? "교사가 숨김" : message.status === "rejected" ? "전달되지 않음" : message.status === "pending" ? "검토 대기" : "전달됨"}</small></div>
            <p>{message.text}</p>
          </li>)}
        </ol>}</>}</>}
    </section>}
    {!loading && !error && students.length > 0 && <div className="teacher-status-grid">
      {students.map((student) => <button key={student.studentUid} type="button"
        ref={(node) => {if (node) cardElements.current.set(student.studentUid,node); else cardElements.current.delete(student.studentUid);}}
        className="teacher-status-card" aria-expanded={selected === student.studentUid}
        aria-controls={selected === student.studentUid ? "teacher-student-detail" : undefined}
        onClick={() => void open(student.studentUid)}>
        <div className="status-card-head">
          <strong>{student.displayName}</strong>
          <span className={`meta-pill${student.participationStatus === "stopped" ? " is-stopped" : ""}`}>{student.participationStatus === "stopped" ? "참여 중단" : "참여 중"}</span>
        </div>
        <div className="status-card-metrics">
          <span>완료한 미션 <b>{student.completedMissions}/{student.totalMissions}개</b></span>
          <span>보낸 쪽지 <b>{student.sentMessages}건</b></span>
        </div>
        <small>{selected === student.studentUid ? "기록 닫기" : "미션·쪽지 기록 보기"}</small>
      </button>)}
    </div>}

  </section>;
}
