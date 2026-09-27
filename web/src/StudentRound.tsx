import { useCallback, useEffect, useState } from "react";
import { call } from "./firebase";

type Activity = { roundId: string; status: string; activityDates: string[]; canSubmit: boolean;
  allowFreeTextMessages: boolean;
  presetMessages: string[]; missions: Array<{missionId: string; text: string; status: string}>;
  inbox: Array<{messageId: string; text: string; hidden: boolean; reported: boolean; type: string}>;
  sent: Array<{messageId: string; text: string; status: string; date: string}>;
  help: Array<{helpId: string; status: string; category: string}> };

export function StudentRound({ roundId, status, incomingDisplayName }: {
  roundId: string; status: string; incomingDisplayName: string | null;
}) {
  const [data, setData] = useState<Activity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedMessage, setSelectedMessage] = useState("");
  const [freeText, setFreeText] = useState("");
  const [helpNote, setHelpNote] = useState("");
  const [reflection, setReflection] = useState("");
  const load = useCallback(async () => {
    const result = await call<null, Activity>("getStudentActivity", null);
    setData(result);
  }, []);
  useEffect(() => { void load().catch(() => setError("활동을 불러오지 못했어요.")); }, [load, roundId]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "처리하지 못했어요."); }
    finally { setBusy(false); }
  }
  const date = new Intl.DateTimeFormat("sv-SE", {timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date());
  const sentToday = data?.sent.some((item) => item.date === date);
  return <div className="student-activities">
    {error && <p className="message error" role="alert">{error}</p>}
    {notice && <p className="message success" role="status">{notice}</p>}
    {status === "revealed" && <section className="panel"><h2>나를 챙긴 친구</h2><p className="secret-name">{incomingDisplayName ?? "안전 사안으로 공개되지 않았어요"}</p>
      {incomingDisplayName && <><p>고마운 마음을 전해요.</p>{["고마워!", "나를 챙겨 줘서 고마워!", "함께해서 즐거웠어!"].map((text) => <button key={text} className="small outline" disabled={busy} onClick={() => void run(async () => { await call<object, object>("sendThankYou", {text, requestId: crypto.randomUUID()}); setNotice("감사 인사를 보냈어요."); })}>{text}</button>)}</>}
      <label>이번 활동을 돌아보기<textarea rows={3} maxLength={300} value={reflection} onChange={(e) => setReflection(e.target.value)} placeholder="내가 해 본 배려나 고마웠던 일을 적어 봐요." /></label><button disabled={busy || !reflection.trim()} onClick={() => void run(async () => { await call<object, object>("saveReflection", {text: reflection}); setNotice("돌아보기를 저장했어요."); })}>돌아보기 저장</button>
    </section>}
    {data && <>
      <section className="panel"><h2>오늘의 배려 미션</h2><p>어렵다면 바꾸거나 쉬어도 괜찮아요.</p><ul className="mission-list">{data.missions.filter((m) => m.status !== "replaced").map((m) => <li key={m.missionId}><strong>{m.text}</strong><span>{m.status === "done" ? "해냈어요" : m.status === "skipped" ? "쉬었어요" : "도전 중"}</span>{data.canSubmit && m.status === "todo" && <div className="action-row"><button className="small" disabled={busy} onClick={() => void run(async () => { await call<object, object>("setMissionStatus", {missionId: m.missionId, status: "done"}); setNotice("미션을 기록했어요."); })}>해냈어요</button><button className="small outline" disabled={busy} onClick={() => void run(async () => { await call<object, object>("replaceMission", {missionId: m.missionId, requestId: crypto.randomUUID()}); setNotice("다른 미션으로 바꿨어요."); })}>다른 미션</button><button className="small outline" disabled={busy} onClick={() => void run(async () => { await call<object, object>("setMissionStatus", {missionId: m.missionId, status: "skipped"}); setNotice("오늘은 쉬어도 괜찮아요."); })}>쉬기</button></div>}</li>)}</ul></section>
      <section className="panel"><h2>응원 쪽지</h2><p>수업일마다 한 번, 내가 챙기는 친구에게만 보낼 수 있어요.</p>
        {data.canSubmit && data.activityDates.includes(date) && !sentToday && <><label>준비된 문구<select value={selectedMessage} onChange={(e) => setSelectedMessage(e.target.value)}><option value="">문구 선택</option>{data.presetMessages.map((text) => <option key={text}>{text}</option>)}</select></label><button disabled={busy || !selectedMessage} onClick={() => void run(async () => { await call<object, object>("sendMessage", {kind: "preset", text: selectedMessage, requestId: crypto.randomUUID()}); setSelectedMessage(""); setNotice("쪽지를 보냈어요."); })}>선택형 쪽지 보내기</button>
          {data.allowFreeTextMessages && <><label>직접 쓰기 (선생님 검토 후 전달)<textarea rows={3} maxLength={200} value={freeText} onChange={(e) => setFreeText(e.target.value)} /></label><button className="outline" disabled={busy || !freeText.trim()} onClick={() => void run(async () => { await call<object, object>("sendMessage", {kind: "free", text: freeText, requestId: crypto.randomUUID()}); setFreeText(""); setNotice("선생님께 검토를 부탁했어요."); })}>직접 쓴 쪽지 보내기</button></>}</>}
        {sentToday && <p>오늘의 쪽지를 보냈어요.</p>}
        <h3>받은 쪽지</h3>{data.inbox.filter((m) => !m.hidden).length === 0 ? <p>아직 받은 쪽지가 없어요.</p> : data.inbox.filter((m) => !m.hidden).map((m) => <div className="review-card" key={m.messageId}><p>{m.text}</p><button className="small outline" disabled={busy} onClick={() => void run(async () => { await call<object, object>("hideMessage", {messageId: m.messageId}); setNotice("쪽지를 숨겼어요."); })}>숨기기</button><button className="small outline" disabled={busy} onClick={() => void run(async () => { await call<object, object>("createHelpRequest", {category: "message", messageId: m.messageId, requestId: crypto.randomUUID()}); setNotice("선생님께 도움을 요청했어요."); })}>선생님께 알리기</button></div>)}
      </section>
      {["active", "paused", "reveal_pending"].includes(status) && <section className="panel"><h2>도움이 필요해요</h2><p>불편하거나 걱정되는 일이 있으면 선생님께 알려 주세요. 공개되거나 감점되지 않아요.</p><label>선생님께 전할 말 (선택)<textarea rows={3} maxLength={300} value={helpNote} onChange={(e) => setHelpNote(e.target.value)} /></label><button disabled={busy} onClick={() => void run(async () => { await call<object, object>("createHelpRequest", {category: "uncomfortable", note: helpNote, requestId: crypto.randomUUID()}); setHelpNote(""); setNotice("선생님께 도움을 요청했어요."); })}>도움 요청하기</button></section>}
    </>}
  </div>;
}
