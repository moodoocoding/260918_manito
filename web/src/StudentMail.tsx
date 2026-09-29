import {useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject} from "react";
import {call} from "./firebase";

type Side = "caredFor" | "carer";
type Draft = {mode:"preset" | "free"; selectedMessage:string; freeText:string};
type InboxMessage = {
  messageId:string; text:string; hidden:boolean; reported:boolean; type:string;
  reacted:boolean; reactionEmoji?:string|null; replyToMessageId:string|null;
  conversation:Side|"unknown"; sequence:number; date?:string|null;
};
type SentMessage = {
  messageId:string; text:string; status:string; date:string; reacted:boolean;
  reactionEmoji?:string|null; replyToMessageId:string|null; conversation:Side|"unknown";
  sequence:number;
};
export type StudentMailData = {
  status:string; activityDates:string[]; koreaDate?:string;
  canSendMessage?:boolean; messagesSentToday?:number; dailyMessageLimit?:number;
  nextActivityDate?:string|null; presetMessages:string[]; inbox:InboxMessage[]; sent:SentMessage[];
  allowFreeTextMessages?:boolean;
};
export type StudentMailDraft = {section:Side; drafts:Record<Side,Draft>};
export function emptyStudentMailDraft(): StudentMailDraft {
  return {section:"caredFor", drafts:{
    caredFor:{mode:"preset",selectedMessage:"",freeText:""},
    carer:{mode:"preset",selectedMessage:"",freeText:""},
  }};
}

const labels: Record<Side,string> = {caredFor:"내가 맡은 친구", carer:"나를 맡은 친구"};
const dateLabel = (day?: string | null) => day ? `${Number(day.slice(5,7))}월 ${Number(day.slice(8,10))}일` : "";
const EMOJI_REACTIONS = ["❤️", "👍", "🥰", "🙏", "🎉"] as const;

export function StudentMail({roundId, data, busy, run, setNotice, draftRef, feedback}: {
  roundId:string; data:StudentMailData; busy:boolean;
  run:(action:()=>Promise<void>)=>Promise<void>; setNotice:(value:string)=>void;
  draftRef:RefObject<StudentMailDraft>; feedback:ReactNode;
}) {
  const [section,setSection] = useState<Side>(() => draftRef.current.section);
  const [drafts,setDrafts] = useState(() => draftRef.current.drafts);
  const [showPresetTray, setShowPresetTray] = useState(false);
  const [activeReactionMessageId, setActiveReactionMessageId] = useState<string | null>(null);
  const [activeMenuMessageId, setActiveMenuMessageId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

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
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [section, messages.length]);

  // Close reaction pickers when clicking outside
  useEffect(() => {
    function handleClickOutside() {
      setActiveReactionMessageId(null);
      setActiveMenuMessageId(null);
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

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

  async function handleReaction(messageId: string, emoji: string) {
    if (busy) return;
    await run(async () => {
      await call<object,object>("reactToMessage", {
        roundId,
        messageId,
        emoji,
        requestId: crypto.randomUUID(),
      });
      setActiveReactionMessageId(null);
      setNotice(`${emoji} 반응을 남겼어요!`);
    });
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    void send();
  }

  return <section className="panel student-conversations kakao-messenger-container">
    <div className="panel-section-head">
      <h2>비밀친구 우편함</h2>
      <p className="field-help">쪽지는 선택한 친구 한 명에게만 전해져요. 활동 중에는 서로의 이름이 비밀로 지켜져요.</p>
    </div>

    {/* 상단 관계 전환 세그먼트 탭 */}
    <div className="student-mail-tabs segmented-track" role="group" aria-label="대화 선택">
      {(["caredFor","carer"] as const).map((side) => <button key={side} type="button"
        className={section === side ? "is-active" : "outline"} aria-pressed={section === side} disabled={busy}
        onClick={() => {
          setSection(side);
          setShowPresetTray(false);
          setActiveReactionMessageId(null);
          setActiveMenuMessageId(null);
        }}>{labels[side]}</button>)}
    </div>

    {feedback}

    {/* 메신저 룸 전체 카드 */}
    <div className="kakao-chat-room">
      {/* 룸 헤더: 카카오톡 스타일 상대방 이름 및 쿼터 */}
      <div className="kakao-chat-header">
        <div className="kakao-partner-profile">
          <div className="kakao-avatar">{section === "caredFor" ? "🎁" : "💌"}</div>
          <div className="kakao-partner-meta">
            <span className="kakao-partner-name">{labels[section]}</span>
            <span className="kakao-partner-sub">
              {section === "caredFor" ? "내가 배정받아 챙겨주는 마니또 친구" : "나를 몰래 챙겨주는 비밀친구"}
            </span>
          </div>
        </div>
        {canWrite && <span className="kakao-quota-badge">오늘 {data.messagesSentToday ?? 0}/{data.dailyMessageLimit ?? 10}건</span>}
      </div>

      {/* 대화 스크롤 영역 (리스트 번호 없이 카카오톡 말풍선 정렬) */}
      <div className="kakao-chat-scroll" ref={chatScrollRef}>
        {messages.length === 0 ? (
          <div className="kakao-chat-empty">
            <span className="empty-icon">💬</span>
            <p>
              {section === "caredFor"
                ? "아직 주고받은 쪽지가 없어요.\n아래에서 첫 응원 쪽지를 보내 보세요!"
                : "아직 이 친구에게 받은 쪽지가 없어요.\n쪽지가 도착하면 이곳에서 바로 답장할 수 있어요."}
            </p>
          </div>
        ) : (
          <div className="kakao-message-list" role="log" aria-label={`${labels[section]}와 주고받은 쪽지`}>
            {messages.map((message) => {
              const isSent = message.direction === "sent";
              const isReactionOpen = activeReactionMessageId === message.messageId;
              const isMenuOpen = activeMenuMessageId === message.messageId;

              return (
                <div key={message.messageId} className={`kakao-message-row ${isSent ? "is-sent" : "is-received"}`}>
                  {!isSent && <div className="kakao-row-avatar">💌</div>}

                  <div className="kakao-bubble-container">
                    {!isSent && <span className="kakao-sender-tag">비밀친구</span>}

                    <div className="kakao-bubble-with-meta">
                      {/* 내가 보낸 쪽지일 때: 타임스탬프와 반응 배지가 말풍선 왼쪽에 위치 */}
                      {isSent && (
                        <div className="kakao-msg-side-meta is-left">
                          <span className="kakao-msg-time">{message.date?.slice(5) || "오늘"}</span>
                          <span className="kakao-msg-status">
                            {message.status === "pending" ? "검토중" : message.status === "rejected" ? "미전달" : "전송됨"}
                          </span>
                        </div>
                      )}

                      {/* 말풍선 본체 */}
                      <div className={`kakao-bubble ${isSent ? "kakao-sent" : "kakao-received"}`}>
                        <p className="kakao-msg-text">{message.text}</p>

                        {/* 말풍선에 붙는 이모티콘 반응 배지 (카카오톡 스타일) */}
                        {message.reacted && (
                          <div className="kakao-reaction-pill" title="친구가 반응을 남겼어요">
                            <span className="reaction-emoji">{message.reactionEmoji || "❤️"}</span>
                            <span className="reaction-count">1</span>
                          </div>
                        )}
                      </div>

                      {/* 받은 쪽지일 때: 타임스탬프, 이모티콘 반응 버튼, 더보기 메뉴가 말풍선 오른쪽에 위치 */}
                      {!isSent && (
                        <div className="kakao-msg-side-meta is-right">
                          <div className="kakao-action-icons">
                            {/* 이모티콘 반응 트리거 버튼 */}
                            {!message.reacted && data.status !== "archived" && (
                              <button
                                type="button"
                                className="kakao-mini-btn react-btn"
                                title="이모티콘 반응 남기기"
                                aria-label="이모티콘 반응 남기기"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuMessageId(null);
                                  setActiveReactionMessageId(isReactionOpen ? null : message.messageId);
                                }}
                              >
                                😊
                              </button>
                            )}

                            {/* 쪽지 더보기(숨기기/신고) 메뉴 버튼 */}
                            <button
                              type="button"
                              className="kakao-mini-btn menu-btn"
                              title="더보기"
                              aria-label="더보기"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveReactionMessageId(null);
                                setActiveMenuMessageId(isMenuOpen ? null : message.messageId);
                              }}
                            >
                              •••
                            </button>
                          </div>
                          <span className="kakao-msg-time">{message.date?.slice(5) || "오늘"}</span>
                        </div>
                      )}
                    </div>

                    {/* 카카오톡 이모티콘 팝오버 바 (말풍선 바로 위에 뜸) */}
                    {isReactionOpen && (
                      <div
                        className="kakao-reaction-picker-popover"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-label="이모티콘 반응 선택"
                      >
                        {EMOJI_REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            className="emoji-pop-btn"
                            disabled={busy}
                            onClick={() => void handleReaction(message.messageId, emoji)}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* 쪽지 관리 메뉴 팝오버 (숨기기 / 선생님께 알리기) */}
                    {isMenuOpen && (
                      <div
                        className="kakao-message-menu-popover"
                        onClick={(e) => e.stopPropagation()}
                        role="menu"
                      >
                        <button
                          type="button"
                          className="menu-item"
                          disabled={busy}
                          onClick={() => void run(async () => {
                            await call<object,object>("hideMessage", {roundId, messageId:message.messageId});
                            setActiveMenuMessageId(null);
                            setNotice("쪽지를 숨겼어요.");
                          })}
                        >
                          👁️ 쪽지 숨기기
                        </button>
                        {"reported" in message && !message.reported && (
                          <button
                            type="button"
                            className="menu-item is-warn"
                            disabled={busy}
                            onClick={() => void run(async () => {
                              await call<object,object>("createHelpRequest", {
                                roundId,
                                category:"message",
                                messageId:message.messageId,
                                requestId:crypto.randomUUID()
                              });
                              setActiveMenuMessageId(null);
                              setNotice("선생님께 비공개로 알렸어요.");
                            })}
                          >
                            🚨 선생님께 알리기
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 카카오톡 스타일 하단 일체형 입력바 */}
      {canWrite ? (
        <div className="kakao-input-area">
          {/* '+' 버튼 누르면 열리는 추천 문구 & 이모티콘 서랍 */}
          {showPresetTray && (
            <div className="kakao-preset-drawer" role="region" aria-label="추천 쪽지 문구">
              <div className="drawer-header">
                <span className="drawer-title">💡 따뜻한 추천 문구를 골라보세요</span>
                <button
                  type="button"
                  className="drawer-close-btn"
                  aria-label="서랍 닫기"
                  onClick={() => setShowPresetTray(false)}
                >
                  ✕
                </button>
              </div>
              <div className="drawer-chips-wrap">
                {data.presetMessages.map((text) => (
                  <button
                    key={text}
                    type="button"
                    className={`drawer-chip ${currentText === text ? "is-selected" : ""}`}
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

          {/* 메신저 인풋 바: '+' 버튼 + 입력창 + 노란색/코랄 전송 버튼 */}
          <form className="kakao-input-bar" onSubmit={handleFormSubmit}>
            <button
              type="button"
              className={`kakao-plus-btn ${showPresetTray ? "is-active" : ""}`}
              aria-label={showPresetTray ? "추천 문구 닫기" : "추천 문구 열기"}
              aria-expanded={showPresetTray}
              title="추천 문구 모아보기"
              onClick={() => setShowPresetTray((prev) => !prev)}
            >
              <span className="plus-icon">+</span>
            </button>
            <div className="kakao-input-field">
              <textarea
                ref={textareaRef}
                className="kakao-textarea"
                placeholder={section === "caredFor" ? "따뜻한 쪽지를 보내보세요 (+ 버튼으로 추천 문구 선택)" : "친구에게 보낼 답장을 적어보세요..."}
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
                <span className="kakao-char-count">{currentText.length}/200자</span>
              )}
            </div>
            <button
              type="submit"
              className="kakao-send-btn"
              disabled={busy || !currentText.trim()}
              aria-label="쪽지 보내기"
            >
              보내기
            </button>
          </form>
        </div>
      ) : (
        <div className="kakao-disabled-bar">
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
