import { useCallback, useEffect, useState } from "react";
import { call } from "./firebase";

type Activity = { roundId: string; title: string; status: string;
  targetDisplayName: string | null; incomingDisplayName: string | null;
  activityDates: string[]; canSubmit: boolean; koreaDate?: string; canSendMessage?: boolean;
  messagesSentToday?: number; dailyMessageLimit?: number;
  nextActivityDate?: string | null; reflectionText?: string | null; thankYouSent?: boolean;
  allowFreeTextMessages: boolean;
  presetMessages: string[]; missions: Array<{missionId: string; text: string; status: string}>;
  inbox: Array<{messageId: string; text: string; hidden: boolean; reported: boolean; type: string; reacted: boolean; replyToMessageId: string | null}>;
  sent: Array<{messageId: string; text: string; status: string; date: string; reacted: boolean; replyToMessageId: string | null}>;
  help: Array<{helpId: string; status: string; category: string}> };

export function StudentRound({ roundId, status, incomingDisplayName, refreshVersion, view, gradeBand }: {
  roundId: string; status: string; incomingDisplayName: string | null; refreshVersion: number;
  view: "today" | "mail" | "help" | "history"; gradeBand?: string;
}) {
  const [data, setData] = useState<Activity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedMessage, setSelectedMessage] = useState("");
  const [freeText, setFreeText] = useState("");
  const [replyToMessageId, setReplyToMessageId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [helpNote, setHelpNote] = useState("");
  const [reflection, setReflection] = useState("");
  const [incomingVisible, setIncomingVisible] = useState(false);
  const [pastTargetVisible, setPastTargetVisible] = useState(false);
  const [showAllMissions, setShowAllMissions] = useState(false);
  const [messageMode, setMessageMode] = useState<"preset" | "free">("preset");
  const [helpReason, setHelpReason] = useState("걱정되는 일이 있어요");
  const [thankYouSentLocal, setThankYouSentLocal] = useState(false);
  const load = useCallback(() => call<{roundId: string}, Activity>("getStudentActivity", {roundId}), [roundId]);
  useEffect(() => {
    let active = true;
    setData(null); setIncomingVisible(false); setPastTargetVisible(false); setReplyToMessageId(null); setReplyText("");
    void load().then((result) => { if (active) { setData(result); setReflection(result.reflectionText ?? ""); } })
      .catch(() => { if (active) setError("활동을 불러오지 못했어요."); });
    return () => { active = false; };
  }, [load, status, refreshVersion]);
  useEffect(() => { setIncomingVisible(false); setPastTargetVisible(false); }, [view]);
  useEffect(() => {
    const hide = () => { if (document.visibilityState !== "visible") { setIncomingVisible(false); setPastTargetVisible(false); } };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action();
      try { setData(await load()); } catch { setError("작업은 완료됐어요. 최신 내용을 다시 확인해 주세요."); }
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : "처리하지 못했어요."); }
    finally { setBusy(false); }
  }
  const date = data?.koreaDate ?? new Intl.DateTimeFormat("sv-SE", {timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date());
  const canSend = data?.canSendMessage ?? (data?.canSubmit && data.activityDates.includes(date));
  const nextDate = data?.nextActivityDate ?? data?.activityDates.find((day) => day > date);
  const missions = data?.missions.filter((m) => m.status !== "replaced") ?? [];
  const visibleMissions = view === "history" || showAllMissions ? missions : (missions.find((m) => m.status === "todo") ? [missions.find((m) => m.status === "todo")!] : missions.slice(0,1));
  const revealed = ["revealed", "archived"].includes(data?.status ?? status);
  const incoming = data?.incomingDisplayName ?? incomingDisplayName;
  const statusMessage: Record<string,string> = {
    active:"이번 활동이 진행 중이에요.", paused:"지금은 활동을 잠깐 쉬고 있어요.",
    reveal_pending:"활동이 끝났어요. 선생님이 친구 공개를 준비하고 있어요.",
    revealed:"친구를 확인하고 고마운 마음을 전할 수 있어요.", archived:"지난 활동의 기록이에요."
  };
  return <div className="student-activities">
    {error && <p className="message error" role="alert">{error}</p>}
    {notice && <p className="message success" role="status">{notice}</p>}
    {!data && !error && <section className="panel"><p>활동을 불러오는 중이에요…</p></section>}
    {error && !data && <button className="outline" onClick={() => { setError(""); void load().then(setData).catch(() => setError("다시 불러오지 못했어요.")); }}>다시 시도</button>}
    {data && <>
      {(view === "today" || view === "history") && revealed && <section className="panel"><h2>{view === "history" ? data.title : "나를 챙긴 친구"}</h2>
        {view === "history" && <><h3>내가 챙긴 친구</h3><div className="student-secret">{pastTargetVisible ? data.targetDisplayName ?? "안전 사안으로 공개되지 않았어요" : "•••"}</div><p><button onClick={() => setPastTargetVisible((value) => !value)}>{pastTargetVisible ? "다시 가리기" : "친구 보기"}</button></p><h3>나를 챙긴 친구</h3></>}
        <div className="student-secret">{incomingVisible ? incoming ?? "안전 사안으로 공개되지 않았어요" : "•••"}</div>
        <p><button onClick={() => setIncomingVisible((value) => !value)}>{incomingVisible ? "다시 가리기" : "친구 보기"}</button></p>
        {view === "history" ? data.reflectionText && <p>돌아보기: {data.reflectionText}</p> : data.status === "revealed" && <>
          {incoming && <><h3>고마운 마음 전하기</h3>{data.thankYouSent || thankYouSentLocal ? <p>감사 인사를 전했어요.</p> : <div className="action-row">{["고마워!", "나를 챙겨 줘서 고마워!", "함께해서 즐거웠어!"].map((text) => <button key={text} className="small outline" disabled={busy} onClick={() => void run(async () => { await call<object, object>("sendThankYou", {roundId, text, requestId: crypto.randomUUID()}); setThankYouSentLocal(true); setNotice("감사 인사를 보냈어요."); })}>{text}</button>)}</div>}</>}
          <h3>이번 활동 돌아보기</h3>
          {gradeBand === "lower" ? <><p>마음에 드는 말을 골라 주세요.</p><div className="action-row">{["친구를 도와줘서 기뻤어요.", "친구가 고마웠어요.", "다음에도 함께하고 싶어요."].map((text) => <button key={text} className="small outline" onClick={() => setReflection(text)}>{text}</button>)}</div><p>선택한 말: {reflection || "아직 고르지 않았어요."}</p></> :
            <label>{gradeBand === "middle" ? "예: 나는 친구를 위해 … 했어요." : "이번 활동에서 해 본 배려나 고마웠던 일"}<textarea rows={3} maxLength={300} value={reflection} onChange={(e) => setReflection(e.target.value)} /></label>}
          <button disabled={busy || !reflection.trim()} onClick={() => void run(async () => { await call<object, object>("saveReflection", {roundId, text: reflection}); setNotice("돌아보기를 저장했어요."); })}>돌아보기 저장</button>
        </>}
      </section>}
      {(view === "today" || view === "history") && <section className="panel"><h2>이번 활동의 미션</h2><p>{statusMessage[data.status] ?? "선생님께 활동 상태를 확인해 주세요."}</p><p className="field-help">어렵다면 바꾸거나 쉬어도 괜찮아요.</p>
        {missions.length === 0 ? <p>아직 미션이 없어요.</p> : <ul className="mission-list">{visibleMissions.map((m) => <li key={m.missionId}><strong>{m.text}</strong><span>{m.status === "done" ? "해냈어요" : m.status === "skipped" ? "쉬었어요" : "도전 중"}</span>
          {view === "today" && data.canSubmit && m.status === "todo" && <div className="action-row"><button className="small" disabled={busy} onClick={() => void run(async () => { await call<object, object>("setMissionStatus", {missionId: m.missionId, status: "done"}); setNotice("미션을 기록했어요."); })}>해냈어요</button><button className="small outline" disabled={busy} onClick={() => void run(async () => { await call<object, object>("replaceMission", {missionId: m.missionId, requestId: crypto.randomUUID()}); setNotice("다른 미션으로 바꿨어요."); })}>다른 미션</button><button className="small outline" disabled={busy} onClick={() => void run(async () => { await call<object, object>("setMissionStatus", {missionId: m.missionId, status: "skipped"}); setNotice("쉬어도 괜찮아요."); })}>쉬기</button></div>}</li>)}</ul>}
        {view === "today" && missions.length > 1 && <button className="small outline" onClick={() => setShowAllMissions((value) => !value)}>{showAllMissions ? "현재 미션만 보기" : "다른 미션 보기"}</button>}
      </section>}
      {(view === "mail" || view === "history") && <section className="panel"><h2>비밀친구 쪽지</h2><p>내가 챙기는 친구에게 먼저 보내거나, 받은 쪽지에 답장할 수 있어요. 친구에게 발신자 이름은 보이지 않지만 선생님은 안전을 위해 대화를 확인할 수 있어요.</p>
        {view === "mail" && (data.status !== "active" ? <p>{statusMessage[data.status] ?? "지금은 쪽지를 보낼 수 없어요."}</p> : !canSend ? <p>{data.activityDates.includes(date) ? "오늘 보낼 수 있는 쪽지 10건을 모두 사용했어요." : `오늘은 쪽지를 쉬는 날이에요. ${nextDate ? `다음 수업일은 ${nextDate}이에요.` : "다음 활동일은 선생님께 확인해 주세요."}`}</p> : <>
          <p className="field-help">오늘 {data.messagesSentToday ?? 0}/{data.dailyMessageLimit ?? 10}건 보냈어요.</p><div className="action-row"><button type="button" className={messageMode === "preset" ? "small" : "small outline"} onClick={() => setMessageMode("preset")}>준비된 문구</button><button type="button" className={messageMode === "free" ? "small" : "small outline"} onClick={() => setMessageMode("free")}>직접 쓰기</button></div>
          {messageMode === "preset" ? <><label>내가 챙기는 친구에게 전할 말<select value={selectedMessage} onChange={(e) => setSelectedMessage(e.target.value)}><option value="">문구 선택</option>{data.presetMessages.map((text) => <option key={text}>{text}</option>)}</select></label><button disabled={busy || !selectedMessage} onClick={() => void run(async () => { await call<object, object>("sendMessage", {kind: "preset", text: selectedMessage, requestId: crypto.randomUUID()}); setSelectedMessage(""); setNotice("쪽지를 바로 전했어요."); })}>쪽지 보내기</button></> : <><label>내가 챙기는 친구에게 직접 쓰기<textarea rows={3} maxLength={200} value={freeText} onChange={(e) => setFreeText(e.target.value)} /></label><button disabled={busy || !freeText.trim()} onClick={() => void run(async () => { await call<object, object>("sendMessage", {kind: "free", text: freeText, requestId: crypto.randomUUID()}); setFreeText(""); setNotice("쪽지를 바로 전했어요."); })}>쪽지 보내기</button></>}
        </>)}
        <h3>받은 쪽지</h3>{data.inbox.filter((m) => !m.hidden).length === 0 ? <p>아직 받은 쪽지가 없어요.</p> : data.inbox.filter((m) => !m.hidden).map((m) => <div className="review-card" key={m.messageId}><p>{m.text}</p>{m.reacted && <p>고마워요를 전했어요.</p>}{view === "mail" && canSend && <button className="small outline" disabled={busy} onClick={() => {setReplyToMessageId((old) => old === m.messageId ? null : m.messageId); setReplyText("");}}>{replyToMessageId === m.messageId ? "답장 닫기" : "익명으로 답장"}</button>}{replyToMessageId === m.messageId && canSend && <div className="reply-form"><label>이 쪽지에 답장<textarea rows={3} maxLength={200} value={replyText} onChange={(e) => setReplyText(e.target.value)} /></label><button disabled={busy || !replyText.trim()} onClick={() => void run(async () => {await call<object, object>("sendMessage", {kind:"free", text:replyText, replyToMessageId:m.messageId, requestId:crypto.randomUUID()}); setReplyText(""); setReplyToMessageId(null); setNotice("답장을 바로 전했어요.");})}>답장 보내기</button></div>}{m.type === "encouragement" && !m.reacted && data.status !== "archived" && <button className="small outline" disabled={busy} onClick={() => void run(async () => { await call<object, object>("reactToMessage", {roundId, messageId: m.messageId, requestId: crypto.randomUUID()}); setNotice("고마워요를 전했어요."); })}>고마워요</button>}<button className="small outline" disabled={busy} onClick={() => void run(async () => { await call<object, object>("hideMessage", {roundId, messageId: m.messageId}); setNotice("쪽지를 숨겼어요."); })}>숨기기</button>{!m.reported && <button className="small outline" disabled={busy} onClick={() => void run(async () => { await call<object, object>("createHelpRequest", {roundId, category: "message", messageId: m.messageId, requestId: crypto.randomUUID()}); setNotice("선생님께 알렸어요."); })}>선생님께 알리기</button>}</div>)}
        <h3>보낸 쪽지</h3>{data.sent.length === 0 ? <p>아직 보낸 쪽지가 없어요.</p> : data.sent.map((m) => <div className="sent-message" key={m.messageId}><small>{m.date} · {m.replyToMessageId ? "답장" : "첫 쪽지"} · {m.status === "pending" ? "이전 방식 검토 중" : m.status === "rejected" ? "전달되지 않음" : m.status === "moderated" ? "선생님이 숨김" : "전달됨"}{m.reacted ? " · 친구가 고마워했어요" : ""}</small><p>{m.text}</p></div>)}
      </section>}
      {view === "help" && <section className="panel"><h2>도움이 필요해요</h2><p>불편하거나 걱정되는 일이 있으면 선생님께 알려 주세요. 공개되거나 감점되지 않아요.</p><label>어떤 일이 걱정되나요?<select value={helpReason} onChange={(e) => setHelpReason(e.target.value)}><option>걱정되는 일이 있어요</option><option>활동이 어려워요</option><option>친구와의 일이 불편해요</option></select></label><label>더 전할 말 (선택)<textarea rows={3} maxLength={260} value={helpNote} onChange={(e) => setHelpNote(e.target.value)} /></label><button disabled={busy} onClick={() => void run(async () => { await call<object, object>("createHelpRequest", {roundId, category: "uncomfortable", note: `${helpReason}${helpNote.trim() ? ` · ${helpNote.trim()}` : ""}`, requestId: crypto.randomUUID()}); setHelpNote(""); setNotice("선생님께 도움을 요청했어요."); })}>도움 요청하기</button><h3>내 요청</h3>{data.help.length === 0 ? <p>접수한 요청이 없어요.</p> : <ul>{data.help.map((h) => <li key={h.helpId}>{h.category === "message" ? "쪽지에 관해 알림" : "도움 요청"} · {h.status === "open" ? "선생님 확인 중" : "처리됨"}</li>)}</ul>}</section>}
    </>}
  </div>;
}
