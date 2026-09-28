import { useCallback, useEffect, useRef, useState } from "react";
import { call } from "./firebase";

type Round = {roundId: string; title: string; status: string; participantCount: number; startsAt: string};
type Assignment = {giverUid: string; giverName: string; receiverUid: string; receiverName: string};
type AssignmentResult = {participantCount: number; assignments: Assignment[]};
const visibleStatuses = new Set(["active", "paused", "reveal_pending", "revealed", "archived"]);
const statusLabels: Record<string, string> = {active:"진행 중", paused:"일시정지", reveal_pending:"공개 대기",
  revealed:"공개 완료", archived:"보관"};

export function TeacherAssignments({classId}: {classId: string}) {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [roundId, setRoundId] = useState("");
  const [result, setResult] = useState<AssignmentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestVersion = useRef(0);
  const hide = useCallback(() => { requestVersion.current += 1; setResult(null); setBusy(false); }, []);

  useEffect(() => {
    let active = true;
    void call<{classId: string}, {rounds: Round[]}>("listRounds", {classId})
      .then(({rounds: items}) => {
        if (!active) return;
        const available = items.filter((item) => visibleStatuses.has(item.status));
        setRounds(available);
        setRoundId(available.find((item) => ["active", "paused", "reveal_pending"].includes(item.status))?.roundId
          ?? available[0]?.roundId ?? "");
        setError("");
      })
      .catch(() => { if (active) setError("시즌 목록을 불러오지 못했어요. 페이지를 다시 열어 주세요."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; requestVersion.current += 1; };
  }, [classId]);

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState !== "visible") hide(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [hide]);
  useEffect(() => {
    if (!result) return;
    const timer = window.setTimeout(hide, 5 * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, [result, hide]);

  async function show() {
    if (!roundId || busy) return;
    const version = ++requestVersion.current;
    setBusy(true); setError(""); setResult(null);
    try {
      const data = await call<{classId: string; roundId: string}, AssignmentResult>(
        "getAssignmentsForTeacher", {classId, roundId});
      if (version === requestVersion.current && document.visibilityState === "visible") setResult(data);
    } catch (cause) {
      if (version === requestVersion.current) setError(
        cause && typeof cause === "object" && "code" in cause && String(cause.code).includes("failed-precondition")
          ? "배정 정보가 일치하지 않아요. 시즌 운영을 멈추고 관리자에게 문의해 주세요."
          : "배정표를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.");
    } finally { if (version === requestVersion.current) setBusy(false); }
  }

  const selected = rounds.find((item) => item.roundId === roundId);
  const incoming = new Map(result?.assignments.map((item) => [item.receiverUid, item.giverName]));
  return <section className="panel teacher-assignments">
    <div className="page-header"><div><h2>배정 확인</h2><p>시즌을 시작할 때 확정한 학생별 관계를 확인해요.</p></div></div>
    <p className="field-help">배정 관계는 담당 선생님에게만 보여요. 학생에게는 공개 승인 전까지 상대 이름을 보여주지 않습니다.</p>
    {loading ? <p role="status">시즌 목록을 불러오는 중이에요…</p> : rounds.length === 0
      ? (!error && <p>배정된 시즌이 없어요. 시즌 설정에서 참가자를 정하고 시즌을 시작해 주세요.</p>)
      : <div className="assignment-controls"><label htmlFor="assignment-round">확인할 시즌</label>
        <select id="assignment-round" value={roundId} disabled={busy || rounds.length === 0}
          onChange={(event) => { hide(); setRoundId(event.target.value); setError(""); }}>
          {rounds.map((item) => <option key={item.roundId} value={item.roundId}>{item.title} · {statusLabels[item.status]}</option>)}
        </select>
        <button type="button" disabled={!roundId || busy} onClick={() => void show()}>{busy ? "확인 중…" : result ? "다시 확인" : "배정표 보기"}</button>
        {result && <button type="button" className="outline" onClick={hide}>배정표 가리기</button>}
      </div>}
    {error && <p className="message error" role="alert">{error}</p>}
    {result && selected && <div className="assignment-results">
      <div className="assignment-summary" role="status"><strong>모두 한 명씩 배정됐어요</strong>
        <span>참가 {result.participantCount}명 · 맡은 관계 {result.assignments.length}건 · 맡겨진 학생 {incoming.size}명</span></div>
      <p className="field-help">시즌 시작 당시 확정 배정입니다. 중간에 참여를 멈춘 학생이 있어도 관계를 다시 섞지 않아요.</p>
      <div className="assignment-table-wrap"><table><caption>{selected.title} 학생별 배정</caption>
        <thead><tr><th scope="col">학생</th><th scope="col">내가 맡은 친구</th><th scope="col">나를 맡은 친구</th></tr></thead>
        <tbody>{result.assignments.map((item) => <tr key={item.giverUid}><th scope="row">{item.giverName}</th>
          <td data-label="내가 맡은 친구">{item.receiverName}</td><td data-label="나를 맡은 친구">{incoming.get(item.giverUid)}</td></tr>)}</tbody>
      </table></div>
    </div>}
  </section>;
}
