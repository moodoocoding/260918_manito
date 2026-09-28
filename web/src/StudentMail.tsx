import {useEffect, useRef, useState, type ReactNode, type RefObject} from "react";
import {call} from "./firebase";

type Side = "caredFor" | "carer";
type Draft = {mode:"preset" | "free"; selectedMessage:string; freeText:string};
type InboxMessage = {messageId:string; text:string; hidden:boolean; reported:boolean; type:string;
  reacted:boolean; replyToMessageId:string|null; conversation:Side|"unknown"; sequence:number};
type SentMessage = {messageId:string; text:string; status:string; date:string; reacted:boolean;
  replyToMessageId:string|null; conversation:Side|"unknown"; sequence:number};
export type StudentMailData = {status:string; activityDates:string[]; koreaDate?:string;
  canSendMessage?:boolean; messagesSentToday?:number; dailyMessageLimit?:number;
  nextActivityDate?:string|null; presetMessages:string[]; inbox:InboxMessage[]; sent:SentMessage[]};
export type StudentMailDraft = {section:Side; drafts:Record<Side,Draft>};
export function emptyStudentMailDraft(): StudentMailDraft {
  return {section:"caredFor", drafts:{
    caredFor:{mode:"preset",selectedMessage:"",freeText:""},
    carer:{mode:"preset",selectedMessage:"",freeText:""},
  }};
}

const labels: Record<Side,string> = {caredFor:"내가 맡은 친구", carer:"나를 맡은 친구"};
const dateLabel = (day?: string | null) => day ? `${Number(day.slice(5,7))}월 ${Number(day.slice(8,10))}일` : "";

export function StudentMail({roundId, data, busy, run, setNotice, draftRef, feedback}: {
  roundId:string; data:StudentMailData; busy:boolean;
  run:(action:()=>Promise<void>)=>Promise<void>; setNotice:(value:string)=>void;
  draftRef:RefObject<StudentMailDraft>; feedback:ReactNode;
}) {
  const [section,setSection] = useState<Side>(() => draftRef.current.section);
  const [drafts,setDrafts] = useState(() => draftRef.current.drafts);
  const composeHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { draftRef.current = {section,drafts}; }, [draftRef,section,drafts]);
  const draft = drafts[section];
  const updateDraft = (change:Partial<Draft>) => setDrafts((old) => ({...old,
    [section]:{...old[section],...change}}));
  const all = [
    ...data.inbox.map((message) => ({...message,direction:"received" as const})),
    ...data.sent.map((message) => ({...message,direction:"sent" as const})),
  ].sort((a,b) => a.sequence - b.sequence);
  const messages = all.filter((message) => message.conversation === section &&
    (message.direction === "sent" || !message.hidden));
  const unknown = all.filter((message) => message.conversation === "unknown" &&
    (message.direction === "sent" || !message.hidden));
  const latestIncoming = [...messages].reverse().find((message) => message.direction === "received"
    && !message.reported);
  const replyToMessageId = section === "carer" ? latestIncoming?.messageId : undefined;
  const canWrite = data.status === "active" && data.canSendMessage === true
    && (section === "caredFor" || !!replyToMessageId);
  const selectedText = draft.mode === "preset" ? draft.selectedMessage : draft.freeText.trim();

  async function send() {
    if (!canWrite || !selectedText || busy) return;
    const currentSide = section;
    await run(async () => {
      await call<object,object>("sendMessage", {kind:draft.mode,text:selectedText,
        ...(replyToMessageId ? {replyToMessageId} : {}),requestId:crypto.randomUUID()});
      setDrafts((old) => ({...old,[currentSide]:{...old[currentSide],
        [draft.mode === "preset" ? "selectedMessage" : "freeText"]:""}}));
      setNotice(`${labels[currentSide]} 한 명에게 쪽지를 보냈어요.`);
    });
  }

  return <section className="panel student-conversations"><h2>비밀친구 쪽지</h2>
    <p>두 대화는 따로 보관돼요. 쪽지 한 건은 선택한 관계의 친구 한 명에게만 전해집니다. 친구 이름은 지금 볼 수 없고, 선생님은 안전을 위해 대화를 확인할 수 있어요.</p>
    <div className="student-mail-tabs" role="group" aria-label="대화 선택">
      {(["caredFor","carer"] as const).map((side) => <button key={side} type="button"
        className={section === side ? "" : "outline"} aria-pressed={section === side} disabled={busy}
        onClick={() => setSection(side)}>{labels[side]}</button>)}
    </div>
    <div className="conversation-heading"><h3>{labels[section]}와 나</h3>
      <p>{section === "caredFor" ? "새 쪽지는 내가 맡은 친구에게만 보내요." : "받은 쪽지에 답장하면 나를 맡은 친구에게만 보내요."}</p></div>
    {feedback}
    {canWrite && <button type="button" className="outline student-compose-jump" onClick={() => composeHeadingRef.current?.focus()}>이 친구에게 쪽지 쓰기</button>}
    <ol className="conversation-messages" aria-label={`${labels[section]}와 주고받은 쪽지`}>
      {messages.length === 0 && <li className="conversation-empty">{section === "caredFor"
        ? "아직 주고받은 쪽지가 없어요. 첫 쪽지를 보내 보세요."
        : "아직 이 친구에게 받은 쪽지가 없어요. 쪽지가 오면 여기에서 답장할 수 있어요."}</li>}
      {messages.map((message) => <li key={message.messageId} className={`conversation-message ${message.direction}`}>
        <span className="conversation-direction">{message.direction === "sent" ? "내가 보냄" : "받음"}</span>
        <p>{message.text}</p>
        {message.direction === "sent" ? <small>{message.date} · {message.status === "pending" ? "이전 방식 검토 중"
          : message.status === "rejected" ? "전달되지 않음" : message.status === "moderated" ? "선생님이 숨김" : "전달됨"}
          {message.reacted ? " · 친구가 고마워했어요" : ""}</small>
          : <div className="conversation-actions">
            {message.reacted && <small>고마워요를 전했어요.</small>}
            {message.type === "encouragement" && !message.reacted && data.status !== "archived" &&
              <button type="button" className="small outline" disabled={busy} onClick={() => void run(async () => {
                await call<object,object>("reactToMessage", {roundId,messageId:message.messageId,requestId:crypto.randomUUID()});
                setNotice("고마워요를 전했어요."); })}>고마워요</button>}
            <button type="button" className="small outline" disabled={busy} onClick={() => void run(async () => {
              await call<object,object>("hideMessage", {roundId,messageId:message.messageId});
              setNotice("쪽지를 숨겼어요."); })}>숨기기</button>
            {!message.reported && <button type="button" className="small outline" disabled={busy}
              onClick={() => void run(async () => { await call<object,object>("createHelpRequest",
                {roundId,category:"message",messageId:message.messageId,requestId:crypto.randomUUID()});
                setNotice("선생님께 알렸어요."); })}>선생님께 알리기</button>}
          </div>}
      </li>)}
    </ol>
    <div className="conversation-compose"><h3 tabIndex={-1} ref={composeHeadingRef}>{section === "caredFor" ? "이 친구에게 쪽지 쓰기" : "이 친구에게 답장 쓰기"}</h3>
      {data.status !== "active" ? <p>지금은 쪽지를 보낼 수 없어요.</p>
        : !data.canSendMessage ? <p>{data.activityDates.includes(data.koreaDate ?? "")
          ? "오늘 보낼 수 있는 쪽지를 모두 사용했어요."
          : `오늘은 쪽지를 쉬는 날이에요. ${data.nextActivityDate ? `다음 수업일은 ${dateLabel(data.nextActivityDate)}이에요.` : "다음 활동일은 선생님께 확인해 주세요."}`}</p>
        : section === "carer" && !replyToMessageId ? <p>이 친구에게서 먼저 쪽지를 받아야 답장할 수 있어요.</p>
        : <><p className="field-help">{labels[section]} 한 명에게만 전해요. 오늘 {data.messagesSentToday ?? 0}/{data.dailyMessageLimit ?? 10}건 보냈어요.</p>
          <div className="action-row"><button type="button" className={draft.mode === "preset" ? "small" : "small outline"}
            onClick={() => updateDraft({mode:"preset"})}>준비된 문구</button>
            <button type="button" className={draft.mode === "free" ? "small" : "small outline"}
              onClick={() => updateDraft({mode:"free"})}>직접 쓰기</button></div>
          {draft.mode === "preset" ? <label>전할 말<select value={draft.selectedMessage}
            onChange={(event) => updateDraft({selectedMessage:event.target.value})}><option value="">문구 선택</option>
            {data.presetMessages.map((text) => <option key={text}>{text}</option>)}</select></label>
            : <><label>직접 쓰기<textarea rows={3} maxLength={200} value={draft.freeText}
              onChange={(event) => updateDraft({freeText:event.target.value})} /></label>
              <p className="field-help">{draft.freeText.length}/200자</p></>}
          <button type="button" disabled={busy || !selectedText} onClick={() => void send()}>
            {section === "caredFor" ? "맡은 친구에게 보내기" : "나를 맡은 친구에게 답장"}</button></>}
    </div>
    {unknown.length > 0 && <details className="conversation-unknown"><summary>연결을 확인할 수 없는 이전 쪽지 {unknown.length}건</summary>
      <p>어느 대화인지 확인할 수 없어 보내기 기능은 제공하지 않아요. 필요하면 선생님께 알려 주세요.</p>
      {unknown.map((message) => <div className="review-card" key={message.messageId}>
        <strong>{message.direction === "sent" ? "내가 보낸 쪽지" : "받은 쪽지"}</strong><p>{message.text}</p>
        {message.direction === "received" && <button type="button" className="small outline" disabled={busy}
          onClick={() => void run(async () => {await call<object,object>("hideMessage", {roundId,messageId:message.messageId});
            setNotice("쪽지를 숨겼어요.");})}>숨기기</button>}
        {message.direction === "received" && !message.reported && <button type="button" className="small outline"
          disabled={busy} onClick={() => void run(async () => {await call<object,object>("createHelpRequest",
            {roundId,category:"message",messageId:message.messageId,requestId:crypto.randomUUID()});
            setNotice("선생님께 알렸어요.");})}>선생님께 알리기</button>}
      </div>)}</details>}
  </section>;
}
