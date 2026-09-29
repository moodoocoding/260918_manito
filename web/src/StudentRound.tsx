import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { call } from "./firebase";
import { StudentCommunity } from "./StudentCommunity";
import { StudentMail, type StudentMailData, type StudentMailDraft } from "./StudentMail";
export type {StudentMailDraft} from "./StudentMail";

type Mission = { missionId: string; text: string; category: string; status: string };
type Activity = StudentMailData & { roundId: string; title: string; startsOn?: string; endsOn?: string;
  targetDisplayName: string | null; incomingDisplayName: string | null;
  canSubmit: boolean;
  reflectionText?: string | null; thankYouSent?: boolean; allowFreeTextMessages: boolean;
  missions: Mission[];
  missionSummary?: { done: number; todo: number; skipped: number; total: number } | null;
  focusMissionId?: string | null;
  help: Array<{helpId: string; status: string; category: string}> };

type View = "home" | "missions" | "mail" | "help" | "history";
export type StudentMissionUi = {filter: "all" | "todo" | "done" | "skipped"; category: string; limit: number};
const statusCopy: Record<string,string> = {
  active: "활동 중", paused: "잠시 쉬는 중", reveal_pending: "친구 공개 준비 중",
  revealed: "친구 공개 완료", archived: "지난 활동",
};
const missionStatus: Record<string,string> = {todo:"골라볼 미션", done:"해봤어요", skipped:"쉬었어요"};
const categoryOrder = ["인사와 칭찬", "경청과 대화", "협력과 배려", "감사와 응원", "우리 반 미션", "기타 미션"];
const niceDate = (day?: string | null) => day ? `${Number(day.slice(5,7))}월 ${Number(day.slice(8,10))}일` : "";

export function StudentRound({ roundId, status, refreshVersion, view, gradeBand, onNavigate, missionUi, onMissionUiChange, mailDraftRef }: {
  roundId: string; status: string; refreshVersion: number; view: View; gradeBand?: string;
  onNavigate?: (view: "missions" | "mail" | "community" | "history") => void;
  missionUi: StudentMissionUi; onMissionUiChange: (value: StudentMissionUi) => void;
  mailDraftRef: RefObject<StudentMailDraft>;
}) {
  const [data, setData] = useState<Activity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [helpNote, setHelpNote] = useState("");
  const [helpReason, setHelpReason] = useState("걱정되는 일이 있어요");
  const [reflection, setReflection] = useState("");
  const [incomingVisible, setIncomingVisible] = useState(false);
  const [targetVisible, setTargetVisible] = useState(false);
  const [thankYouSentLocal, setThankYouSentLocal] = useState(false);
  const missionFilter = missionUi.filter;
  const category = missionUi.category;
  const missionLimit = missionUi.limit;
  const [openMissionId, setOpenMissionId] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const missionButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusAfterExpand = useRef<string | null>(null);
  const load = useCallback(() => call<{roundId: string}, Activity>("getStudentActivity", {roundId}), [roundId]);
  useEffect(() => {
    let active = true;
    setData(null); setError(""); setIncomingVisible(false); setTargetVisible(false); setOpenMissionId(null);
    void load().then((result) => { if (active) { setData(result); setReflection(result.reflectionText ?? ""); } })
      .catch(() => { if (active) setError("활동을 불러오지 못했어요."); });
    return () => { active = false; };
  }, [load, status, refreshVersion]);
  useEffect(() => { setIncomingVisible(false); setTargetVisible(false); }, [view]);
  useEffect(() => {
    const hide = () => { if (document.visibilityState !== "visible") { setIncomingVisible(false); setTargetVisible(false); } };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  useEffect(() => { if (openMissionId) detailHeadingRef.current?.focus(); }, [openMissionId]);
  useEffect(() => {
    const id = focusAfterExpand.current;
    if (id) { missionButtonRefs.current.get(id)?.focus(); focusAfterExpand.current = null; }
  }, [missionLimit]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try {
      await action();
      try { setData(await load()); } catch { setNotice(""); setError("저장은 완료됐어요. 화면을 다시 불러와 최신 내용을 확인해 주세요. 같은 작업을 다시 누르지 마세요."); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "처리하지 못했어요."); }
    finally { setBusy(false); }
  }
  function closeMission() {
    const id = openMissionId;
    setOpenMissionId(null); setConfirmReplace(false);
    requestAnimationFrame(() => { if (id) missionButtonRefs.current.get(id)?.focus(); });
  }
  const today = data?.koreaDate ?? "";
  const canSend = data?.canSendMessage ?? false;
  const missions = data?.missions.filter((mission) => mission.status !== "replaced") ?? [];
  const summary = data?.missionSummary;
  const filtered = missions.filter((mission) => (missionFilter === "all" || mission.status === missionFilter)
    && (category === "전체" || (mission.category ?? "기타 미션") === category));
  const selectedMission = missions.find((mission) => mission.missionId === openMissionId);
  const firstTodo = missions.find((mission) => mission.missionId === data?.focusMissionId && mission.status === "todo")
    ?? missions.find((mission) => mission.status === "todo");
  const revealed = ["revealed", "archived"].includes(data?.status ?? status);
  const availableCategories = categoryOrder.filter((item) => missions.some((mission) => (mission.category ?? "기타 미션") === item));
  const nextDay = data?.nextActivityDate ?? data?.activityDates.find((day) => day > today);
  const summaryElement = summary ? <div className="student-stat-grid" aria-label="내 미션 기록">
    <div className="student-stat-tile is-done"><span>해봤어요</span><strong>{summary.done}</strong></div>
    <div className="student-stat-tile is-todo"><span>골라볼 미션</span><strong>{summary.todo}</strong></div>
    <div className="student-stat-tile is-skipped"><span>쉬었어요</span><strong>{summary.skipped}</strong></div>
  </div> : <p className="field-help">이전 미션 기록은 아래 목록에서 확인해 주세요.</p>;
  const feedback = <>{error && <p className="message error" role="alert">{error}</p>}{notice && <p className="message success" role="status">{notice}</p>}</>;
  return <div className="student-activities">
    {!data && feedback}
    {!data && !error && <section className="panel"><p role="status">활동을 불러오는 중이에요…</p></section>}
    {error && !data && <button className="outline" onClick={() => { setError(""); void load().then(setData).catch(() => setError("다시 불러오지 못했어요.")); }}>다시 시도</button>}
    {data && <>
      {view === "home" && <>
        <section className="panel student-season student-home-primary">
          <div className="student-season-header">
            <div className="student-season-badges">
              <span className="eyebrow">{statusCopy[data.status] ?? "시즌 안내"}</span>
              {data.status === "active" && <span className="meta-pill">다음 쪽지 활동일 · {niceDate(canSend ? today : nextDay) || "선생님께 확인"}</span>}
            </div>
            <h2>{data.title}</h2>
            <p className="student-season-dates">활동 기간 {niceDate(data.startsOn)} ~ {niceDate(data.endsOn)}</p>
          </div>
          <div className="student-home-summary" aria-label="내 미션 요약">
            <div className="summary-head"><strong>내 미션 현황</strong><span>원하는 순서로 참여해요</span></div>
            {summaryElement}
          </div>
          <div className="student-next-mission">
            <div className="spotlight-head">
              <span className="spotlight-badge">핵심 과업 · 이번에 해볼 미션</span>
              {firstTodo && <span className="category-pill">{firstTodo.category ?? "기타 미션"}</span>}
            </div>
            <h3>이번에 해볼 미션</h3>
            {firstTodo ? <>
              <p className="student-mission-text">{firstTodo.text}</p>
              {data.canSubmit && <button className="primary-cta" disabled={busy} onClick={() => void run(async () => { await call<object, object>("setMissionStatus", {missionId:firstTodo.missionId,status:"done"}); setNotice("미션을 기록했어요."); })}>해냈어요</button>}
            </> : <p className="student-mission-empty">{missions.length ? "지금 골라볼 미션이 없어요. 내 기록을 확인해 보세요." : "아직 미션이 없어요."}</p>}
            {view === "home" && feedback}
            <div className="student-link-row">
              <button className="outline" onClick={() => onNavigate?.("missions")}>{firstTodo ? "미션 골라보기" : "내 기록 보기"}</button>
              {firstTodo && data.canSubmit && <button className="outline" disabled={busy} onClick={() => void run(async () => {await call<object,object>("setMissionStatus", {missionId:firstTodo.missionId,status:"skipped"});setNotice("이 미션은 쉬기로 기록했어요.");})}>이 미션 쉬기</button>}
            </div>
          </div>
          <p className="field-help">{revealed ? "선생님이 친구를 공개했어요. 아래에서 내 관계를 확인할 수 있어요." : "진행 중에는 친구의 이름을 볼 수 없어요. 쪽지는 서버가 배정된 친구에게 전해요."}</p>
        </section>
        <StudentCommunity roundId={roundId} preview onMore={() => onNavigate?.("community")} />
        <section className="panel student-archive-bar">
          <div>
            <strong>지난 시즌 기록이 궁금한가요?</strong>
            <p className="field-help">예전에 완료한 시즌의 비밀친구와 쪽지 기록을 돌아볼 수 있어요.</p>
          </div>
          <button className="outline student-history-link" onClick={() => onNavigate?.("history")}>지난 활동 보기</button>
        </section>
      </>}
      {view === "missions" && <>
        <section className="panel"><div className="panel-section-head"><h2>내 미션 기록</h2><p className="field-help">기록은 나에게만 보여요. 미션을 모두 해야 하는 것은 아니에요.</p></div>{summaryElement}</section>
        <section className="panel"><div className="panel-section-head"><h2>미션 골라보기</h2><p className="field-help">{filtered.length}개 중 {Math.min(filtered.length, missionLimit)}개를 보여 줘요.</p></div>{!selectedMission && feedback}
          {selectedMission ? <div className="student-mission-detail">
            <button className="outline small" onClick={closeMission}>목록으로 돌아가기</button>
            <div className="mission-item-badges">
              <span className={`mission-status-badge status-${selectedMission.status}`}>{missionStatus[selectedMission.status] ?? "기록 확인"}</span>
              <span className="category-pill">{selectedMission.category ?? "기타 미션"}</span>
              {data.focusMissionId === selectedMission.missionId && selectedMission.status === "todo" && <span className="focus-pill">이번에 해볼 미션</span>}
            </div>
            <h3 tabIndex={-1} ref={detailHeadingRef}>{selectedMission.text}</h3>
            <p className="mission-tip-box">교실에서 돈을 쓰지 않고 편하게 해 볼 수 있어요. 상대가 부담스러워하면 멈춰도 괜찮아요.</p>
            {feedback}
            {data.canSubmit && selectedMission.status === "todo" && <>
              <div className="student-mission-actions">
                <button className="primary-cta" disabled={busy} onClick={() => void run(async () => { await call<object, object>("setMissionStatus", {missionId:selectedMission.missionId,status:"done"}); setNotice("미션을 기록했어요."); })}>해냈어요</button>
                <button className="outline" disabled={busy || data.focusMissionId === selectedMission.missionId} onClick={() => void run(async () => {await call<object,object>("setStudentMissionFocus", {roundId,missionId:selectedMission.missionId,requestId:crypto.randomUUID()});setNotice("이번에 해볼 미션으로 골랐어요.");})}>{data.focusMissionId === selectedMission.missionId ? "이번에 해볼 미션으로 선택됨" : "이번에 해볼래요"}</button>
                <button className="outline" disabled={busy} onClick={() => void run(async () => { await call<object, object>("setMissionStatus", {missionId:selectedMission.missionId,status:"skipped"}); setNotice("이 미션은 쉬기로 기록했어요."); })}>이 미션 쉬기</button>
              </div>
              {!confirmReplace ? <button className="outline small" disabled={busy} onClick={() => setConfirmReplace(true)}>이 미션 바꾸기</button>
                : <div className="student-replace-confirm"><p>이 미션을 다른 미션으로 바꾸면 원래 미션은 목록에서 빠져요. 바꾸기는 최대 두 번 가능해요.</p><div className="action-row"><button disabled={busy} onClick={() => void run(async () => { await call<object,object>("replaceMission", {missionId:selectedMission.missionId,requestId:crypto.randomUUID()}); setConfirmReplace(false); closeMission(); setNotice("다른 미션으로 바꿨어요."); })}>바꾸기 확인</button><button className="outline" onClick={() => setConfirmReplace(false)}>취소</button></div></div>}
            </>}
          </div> : <>
            <div className="student-mission-filters"><label>기록 상태<select value={missionFilter} onChange={(event) => onMissionUiChange({...missionUi,filter:event.target.value as StudentMissionUi["filter"],limit:8})}><option value="all">전체</option><option value="todo">골라볼 미션</option><option value="done">해봤어요</option><option value="skipped">쉬었어요</option></select></label>
              <label>미션 종류<select value={category} onChange={(event) => onMissionUiChange({...missionUi,category:event.target.value,limit:8})}><option>전체</option>{availableCategories.map((item) => <option key={item}>{item}</option>)}</select></label></div>
            {filtered.length === 0 ? <div className="student-filter-empty"><p>이 조건에 맞는 미션이 없어요.</p><button className="outline" onClick={() => onMissionUiChange({filter:"all",category:"전체",limit:8})}>전체 미션 보기</button></div>
              : <ul className="student-mission-list">{filtered.slice(0,missionLimit).map((mission) => <li key={mission.missionId} className={`status-${mission.status}${data.focusMissionId === mission.missionId && mission.status === "todo" ? " is-focused" : ""}`}><div><div className="mission-item-badges"><span className={`mission-status-badge status-${mission.status}`}>{missionStatus[mission.status] ?? "기록 확인"}</span><span className="category-pill">{mission.category ?? "기타 미션"}</span>{data.focusMissionId === mission.missionId && mission.status === "todo" && <span className="focus-pill">이번 미션</span>}</div><strong>{mission.text}</strong></div><button className="outline small" ref={(node) => {if(node) missionButtonRefs.current.set(mission.missionId,node);}} onClick={() => setOpenMissionId(mission.missionId)}>이 미션 보기</button></li>)}</ul>}
            {missionLimit < filtered.length && <button className="outline wide" onClick={() => {focusAfterExpand.current = filtered[missionLimit]?.missionId ?? null;onMissionUiChange({...missionUi,limit:missionLimit+8});}}>{Math.min(8, filtered.length-missionLimit)}개 더 보기</button>}
          </>}
        </section>
      </>}
      {(view === "home" || view === "history") && revealed && <section className="panel reveal-panel"><div className="panel-section-head"><h2>친구 공개 결과</h2><p className="field-help">주변에 다른 사람이 없을 때 버튼을 눌러 확인하세요.</p></div>{view === "history" && feedback}
        <div className="reveal-cards-grid">
          <div className="reveal-card"><h3>내가 챙긴 친구</h3><div className="student-secret">{targetVisible ? data.targetDisplayName ?? "안전 사안으로 공개되지 않았어요" : "•••"}</div><button className="outline" onClick={() => setTargetVisible((value) => !value)}>{targetVisible ? "내가 챙긴 친구 가리기" : "내가 챙긴 친구 보기"}</button></div>
          <div className="reveal-card"><h3>나를 챙긴 친구</h3><div className="student-secret">{incomingVisible ? data.incomingDisplayName ?? "안전 사안으로 공개되지 않았어요" : "•••"}</div><button className="outline" onClick={() => setIncomingVisible((value) => !value)}>{incomingVisible ? "나를 챙긴 친구 가리기" : "나를 챙긴 친구 보기"}</button></div>
        </div>
        {view === "history" ? data.reflectionText && <div className="reflection-box"><strong>돌아보기 기록</strong><p>{data.reflectionText}</p></div> : data.status === "revealed" && <div className="reflection-section">
          {data.incomingDisplayName && <div className="thank-you-box"><h3>고마운 마음 전하기</h3>{data.thankYouSent || thankYouSentLocal ? <p className="field-help">감사 인사를 전했어요.</p> : <div className="action-row">{["고마워!", "나를 챙겨 줘서 고마워!", "함께해서 즐거웠어!"].map((text) => <button key={text} className="small outline" disabled={busy} onClick={() => void run(async () => { await call<object, object>("sendThankYou", {roundId, text, requestId: crypto.randomUUID()}); setThankYouSentLocal(true); setNotice("감사 인사를 전했어요."); })}>{text}</button>)}</div>}</div>}
          <div className="reflection-form-box"><h3>이번 활동 돌아보기</h3>
          {gradeBand === "lower" ? <><p className="field-help">마음에 드는 말을 골라 주세요.</p><div className="action-row">{["친구를 도와줘서 기뻤어요.", "친구가 고마웠어요.", "다음에도 함께하고 싶어요."].map((text) => <button key={text} className="small outline" onClick={() => setReflection(text)}>{text}</button>)}</div><p>선택한 말: <strong>{reflection || "아직 고르지 않았어요."}</strong></p></> :
            <label>{gradeBand === "middle" ? "예: 나는 친구를 위해 … 했어요." : "이번 활동에서 해 본 배려나 고마웠던 일"}<textarea rows={3} maxLength={300} value={reflection} onChange={(event) => setReflection(event.target.value)} /></label>}
          <button disabled={busy || !reflection.trim()} onClick={() => void run(async () => { await call<object, object>("saveReflection", {roundId, text: reflection}); setNotice("돌아보기를 저장했어요."); })}>돌아보기 저장</button></div>
        </div>}
      </section>}
      {view === "history" && !revealed && feedback}
      {view === "history" && <section className="panel"><h2>이번 활동의 미션</h2>{summaryElement}<ul className="student-mission-list">{missions.map((mission) => <li key={mission.missionId} className={`status-${mission.status}`}><div><div className="mission-item-badges"><span className={`mission-status-badge status-${mission.status}`}>{missionStatus[mission.status] ?? "기록 확인"}</span></div><strong>{mission.text}</strong></div></li>)}</ul></section>}
      {view === "history" && <section className="panel"><h2>지난 쪽지</h2><h3>받은 쪽지</h3>{data.inbox.filter((message) => !message.hidden).length === 0 ? <p className="muted">받은 쪽지가 없어요.</p> : data.inbox.filter((message) => !message.hidden).map((message) => <div className="review-card" key={message.messageId}><p>{message.text}</p><button className="small outline" disabled={busy} onClick={() => void run(async () => {await call<object,object>("hideMessage", {roundId,messageId:message.messageId});setNotice("쪽지를 숨겼어요.");})}>숨기기</button>{!message.reported && <button className="small outline" disabled={busy} onClick={() => void run(async () => {await call<object,object>("createHelpRequest", {roundId,category:"message",messageId:message.messageId,requestId:crypto.randomUUID()});setNotice("선생님께 알렸어요.");})}>선생님께 알리기</button>}</div>)}<h3>보낸 쪽지</h3>{data.sent.length === 0 ? <p className="muted">보낸 쪽지가 없어요.</p> : data.sent.map((message) => <div className="sent-message" key={message.messageId}><small>{message.date}</small><p>{message.text}</p></div>)}</section>}
      {view === "mail" && <StudentMail roundId={roundId} data={data} busy={busy} run={run} setNotice={setNotice} draftRef={mailDraftRef} feedback={feedback} />}
      {view === "help" && <section className="panel"><div className="panel-section-head"><h2>도움이 필요해요</h2><p className="field-help">불편하거나 걱정되는 일이 있으면 선생님께 알려 주세요. 공개되거나 감점되지 않아요.</p></div><label>어떤 일이 걱정되나요?<select value={helpReason} onChange={(event) => setHelpReason(event.target.value)}><option>걱정되는 일이 있어요</option><option>활동이 어려워요</option><option>친구와의 일이 불편해요</option></select></label><label>더 전할 말 (선택)<textarea rows={3} maxLength={260} value={helpNote} onChange={(event) => setHelpNote(event.target.value)} /></label><button disabled={busy} onClick={() => void run(async () => {await call<object,object>("createHelpRequest", {roundId,category:"uncomfortable",note:`${helpReason}${helpNote.trim() ? ` · ${helpNote.trim()}` : ""}`,requestId:crypto.randomUUID()});setHelpNote("");setNotice("선생님께 도움을 요청했어요.");})}>도움 요청하기</button>{feedback}<div className="help-history-box"><h3>내 요청 내역</h3>{data.help.length === 0 ? <p className="muted">접수한 요청이 없어요.</p> : <ul className="status-pill-list">{data.help.map((item) => <li key={item.helpId}><strong>{item.category === "message" ? "쪽지에 관해 알림" : "도움 요청"}</strong><span className="meta-pill">{item.status === "open" ? "선생님 확인 중" : "처리됨"}</span></li>)}</ul>}</div></section>}
    </>}
  </div>;
}
