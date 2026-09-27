import { useEffect, useRef, useState } from "react";
import { call } from "./firebase";

type Community = {roundId: string; draftText: string; postedText: string | null; postedAt: string | null};
type Action = "save" | "publish" | "unpublish";

export function TeacherCommunity({classId, roundId, roundStatus}: {
  classId: string; roundId: string; roundStatus: string;
}) {
  const [saved, setSaved] = useState<Community | null>(null);
  const [draft, setDraft] = useState("");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef<{key:string; requestId:string} | null>(null);
  async function load(resetDraft = true) {
    const result = await call<{classId:string;roundId:string},Community>("getTeacherCommunity",{classId,roundId});
    setSaved(result);
    if (resetDraft) setDraft(result.draftText);
  }
  useEffect(() => {
    let active = true;
    setSaved(null); setDraft(""); setPreview(false); setError(""); setNotice(""); pending.current = null;
    void call<{classId:string;roundId:string},Community>("getTeacherCommunity",{classId,roundId})
      .then((result) => {if(active){setSaved(result);setDraft(result.draftText);}})
      .catch(() => {if(active)setError("안내를 불러오지 못했어요.");});
    return () => {active=false;};
  }, [classId,roundId]);
  async function change(action: Action) {
    const text = draft.trim();
    const key = `${roundId}:${action}:${action === "save" ? text : saved?.draftText ?? ""}`;
    if (pending.current?.key !== key) pending.current = {key,requestId:crypto.randomUUID()};
    setBusy(true); setError(""); setNotice("");
    try {
      await call<object,object>("updateRoundCommunity",{classId,roundId,action,
        ...(action === "save" ? {text} : {}),requestId:pending.current.requestId});
      pending.current = null;
      try { await load(action !== "save"); }
      catch { setError("변경은 완료됐어요. 최신 안내를 다시 불러와 확인해 주세요."); }
      setPreview(false);
      setNotice(action === "save" ? "초안을 저장했어요. 아직 학생에게 보이지 않아요." :
        action === "publish" ? "학생 화면에 안내를 게시했어요." : "학생 화면에서 안내를 내렸어요.");
    } catch (caught) {setError(caught instanceof Error ? caught.message : "안내를 변경하지 못했어요.");}
    finally {setBusy(false);}
  }
  const editable = !["cancelled","archived"].includes(roundStatus);
  return <section className="teacher-community" aria-label="우리 반 소식 설정">
    <h3>학생 화면 · 우리 반 소식</h3>
    <p className="field-help">학급 활동 숫자는 비공개예요. 학생에게는 검토된 배려 아이디어와 게시된 선생님 안내만 보여요.</p>
    {error && <p className="message error" role="alert">{error} <button className="small outline" onClick={() => void load().catch(() => setError("다시 불러오지 못했어요."))}>다시 불러오기</button></p>}
    {notice && <p className="message success" role="status">{notice}</p>}
    {!saved && !error && <p role="status">안내를 불러오는 중이에요…</p>}
    {saved && <>
      <div className="teacher-community-current"><strong>현재 학생에게 보이는 안내</strong><p>{saved.postedText ?? "게시된 안내가 없어요."}</p></div>
      {editable && <><label>선생님 안내 초안<textarea maxLength={140} rows={3} value={draft} onChange={(event) => {setDraft(event.target.value);setPreview(false);}} /></label>
        <p className="field-help">{[...draft].length}/140자 · 학생 이름, 연락처, 특정 학생을 알아볼 사안, 배정 관계나 쪽지 원문은 적지 마세요.</p>
        <div className="action-row"><button className="outline" disabled={busy || !draft.trim() || draft.trim() === saved.draftText} onClick={() => void change("save")}>초안 저장</button>
          <button className="outline" disabled={busy || !saved.draftText || draft.trim() !== saved.draftText} onClick={() => setPreview((value) => !value)}>{preview ? "미리보기 닫기" : "학생 화면 미리보기"}</button></div>
        {preview && <div className="teacher-community-preview"><strong>학생에게 보일 내용</strong><p>{saved.draftText}</p><button disabled={busy} onClick={() => void change("publish")}>이 안내 게시</button></div>}
        {saved.postedText && <button className="outline" disabled={busy} onClick={() => void change("unpublish")}>게시 내리기</button>}
      </>}
    </>}
  </section>;
}
