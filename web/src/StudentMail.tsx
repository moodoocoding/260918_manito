import {useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject} from "react";
import {call} from "./firebase";

type Side = "caredFor" | "carer";
type Draft = {mode:"preset" | "free"; selectedMessage:string; freeText:string};
type InboxMessage = {messageId:string; text:string; hidden:boolean; reported:boolean; type:string;
  reacted:boolean; replyToMessageId:string|null; conversation:Side|"unknown"; sequence:number};
type SentMessage = {messageId:string; text:string; status:string; date:string; reacted:boolean;
  replyToMessageId:string|null; conversation:Side|"unknown"; sequence:number};
export type StudentMailData = {status:string; activityDates:string[]; koreaDate?:string;
  canSendMessage?:boolean; messagesSentToday?:number; dailyMessageLimit?:number;
  nextActivityDate?:string|null; presetMessages:string[]; inbox:InboxMessage[]; sent:SentMessage[];
  allowFreeTextMessages?:boolean};
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
  const [showPresetTray, setShowPresetTray] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messageListRef = useRef<HTMLOListElement>(null);

  useEffect(() => { draftRef.current = {section,drafts}; }, [draftRef,section,drafts]);

  const draft = drafts[section];
  const currentText = draft.freeText || draft.selectedMessage || "";

  const updateText = (text: string, mode: "preset" | "free") => {
    setDrafts((old) => ({
      ...old,
      [section]: {
        mode,
        selectedMessage: mode === "preset" ? text : "",
        freeText: text,
      },
    }));
  };

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

  // Auto-scroll chat to bottom on new messages or tab change
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [section, messages.length]);

  async function send(textToSend?: string) {
    const raw = (textToSend !== undefined ? textToSend : currentText).trim();
    if (!canWrite || !raw || busy) return;
    const isPreset = data.presetMessages.includes(raw);
    const kind = isPreset ? "preset" : "free";
    const currentSide = section;
    await run(async () => {
      await call<object,object>("sendMessage", {
        kind,
        text: raw,
        ...(replyToMessageId ? {replyToMessageId} : {}),
        requestId: crypto.randomUUID(),
      });
      setDrafts((old) => ({
        ...old,
        [currentSide]: { mode: "free", selectedMessage: "", freeText: "" },
      }));
      setShowPresetTray(false);
      setNotice(`${labels[currentSide]} 한 명에게 쪽지를 보냈어요.`);
    });
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    void send();
  }

  return <section className="panel student-conversations messenger-room">
    <div className="panel-section-head">
      <h2>비밀친구 우편함</h2>
      <p className="field-help">쪽지는 선택한 친구 한 명에게만 전해져요. 활동 중에는 친구 이름이 비밀로 지켜져요.</p>
    </div>

    {/* 상단 관계 전환 세그먼트 탭 */}
    <div className="student-mail-tabs segmented-track" role="group" aria-label="대화 선택">
      {(["caredFor","carer"] as const).map((side) => <button key={side} type="button"
        className={section === side ? "is-active" : "outline"} aria-pressed={section === side} disabled={busy}
        onClick={() => { setSection(side); setShowPresetTray(false); }}>{labels[side]}</button>)}
    </div>

    {/* 메신저 헤더: 현재 대화 상대 및 발송 쿼터 안내 */}
    <div className="messenger-chat-header">
      <div className="chat-partner-info">
        <span className="chat-partner-pill">{labels[section]}</span>
        <span className="chat-partner-desc">
          {section === "caredFor" ? "내가 챙기는 친구와의 1:1 대화" : "나를 챙겨주는 친구와의 1:1 대화"}
        </span>
      </div>
      {canWrite && <span className="chat-quota-pill">오늘 {data.messagesSentToday ?? 0}/{data.dailyMessageLimit ?? 10}건</span>}
    </div>

    {feedback}

    {/* 메신저 대화 캔버스 */}
    <div className="messenger-chat-area">
      <ol className="conversation-messages" ref={messageListRef} aria-label={`${labels[section]}와 주고받은 쪽지`}>
        {messages.length === 0 && <li className="conversation-empty">{section === "caredFor"
          ? "아직 주고받은 쪽지가 없어요. 아래에서 첫 응원 쪽지를 보내 보세요!"
          : "아직 이 친구에게 받은 쪽지가 없어요. 쪽지가 오면 바로 답장할 수 있어요."}</li>}
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

      {/* 카카오톡 스타일 일체형 메시지 입력 영역 */}
      {canWrite ? (
        <div className="messenger-input-wrapper">
          {/* '+' 버튼을 누르면 펼쳐지는 이모티콘/추천 문구 트레이 */}
          {showPresetTray && (
            <div className="chat-preset-tray" role="region" aria-label="추천 쪽지 문구">
              <div className="preset-tray-header">
                <span className="preset-tray-title">따뜻한 추천 문구를 골라보세요</span>
                <button
                  type="button"
                  className="preset-tray-close"
                  aria-label="추천 문구 닫기"
                  onClick={() => setShowPresetTray(false)}
                >
                  ✕
                </button>
              </div>
              <div className="preset-chips-grid">
                {data.presetMessages.map((text) => (
                  <button
                    key={text}
                    type="button"
                    className={`preset-chip ${currentText === text ? "is-selected" : ""}`}
                    onClick={() => {
                      updateText(text, "preset");
                      textareaRef.current?.focus();
                    }}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 메신저 인풋 바: '+' 버튼 + 텍스트 인풋 + 전송 버튼 */}
          <form className="messenger-input-bar" onSubmit={handleFormSubmit}>
            <button
              type="button"
              className={`chat-plus-btn ${showPresetTray ? "is-active" : ""}`}
              aria-label={showPresetTray ? "추천 문구 닫기" : "추천 문구 열기"}
              aria-expanded={showPresetTray}
              title="추천 쪽지 문구 열기"
              onClick={() => setShowPresetTray((prev) => !prev)}
            >
              <span className="plus-icon">+</span>
            </button>
            <div className="chat-input-field-wrap">
              <textarea
                ref={textareaRef}
                className="chat-text-input"
                placeholder={section === "caredFor" ? "따뜻한 응원 쪽지를 남겨보세요... (+ 버튼으로 추천 문구 선택 가능)" : "친구에게 보낼 답장을 적어보세요..."}
                rows={1}
                maxLength={200}
                value={currentText}
                onChange={(e) => updateText(e.target.value, "free")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              {currentText.length > 0 && (
                <span className="chat-char-counter">{currentText.length}/200자</span>
              )}
            </div>
            <button
              type="submit"
              className="chat-send-btn primary-cta"
              disabled={busy || !currentText.trim()}
              aria-label="쪽지 보내기"
            >
              <span>보내기</span>
            </button>
          </form>
        </div>
      ) : (
        <div className="chat-disabled-banner">
          {data.status !== "active" ? (
            <p>지금은 시즌이 진행 중이 아니어서 쪽지를 보낼 수 없어요.</p>
          ) : !data.canSendMessage ? (
            <p>
              {data.activityDates.includes(data.koreaDate ?? "")
                ? "오늘 보낼 수 있는 쪽지 10건을 모두 사용했어요. 내일 또 응원해 주세요!"
                : `오늘은 쪽지를 쉬는 날이에요. ${data.nextActivityDate ? `다음 활동일은 ${dateLabel(data.nextActivityDate)}이에요.` : "다음 활동일을 확인해 주세요."}`}
            </p>
          ) : section === "carer" && !replyToMessageId ? (
            <p>나를 맡은 비밀친구가 첫 쪽지를 보내면 이곳에서 바로 답장할 수 있어요.</p>
          ) : null}
        </div>
      )}
    </div>

    {/* 이전 쪽지 아코디언 */}
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
