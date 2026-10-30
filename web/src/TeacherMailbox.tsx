import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { call } from "./firebase";
import type { TeacherMailDetail, TeacherMailKind, TeacherMailPage, TeacherMailStatus, TeacherMailSummary } from "./teacherMailTypes";
import "./teacher-mailbox.css";

type MailListInput = { classId: string; kind: TeacherMailKind; status: TeacherMailStatus; cursor?: string };
type MailDetailInput = { classId: string; mailId: string };
type MailResolveInput = MailDetailInput & { resolution: string; requestId: string };
export type TeacherMailboxApi = {
  list: (input: MailListInput) => Promise<TeacherMailPage<TeacherMailSummary>>;
  detail: (input: MailDetailInput) => Promise<TeacherMailDetail>;
  resolve: (input: MailResolveInput) => Promise<{ mailId: string; status: "resolved" }>;
};

const defaultApi: TeacherMailboxApi = {
  list: (input) => call("listTeacherMail", input),
  detail: (input) => call("getTeacherMail", input),
  resolve: (input) => call("resolveTeacherMail", input),
};
const kindLabels = { report: "신고", letter: "편지" };
const statusLabels = { received: "접수됨", resolved: "처리 완료" };
const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "접수 시각 확인 중" : new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date);
};

export function TeacherMailbox({ classId, api = defaultApi }: { classId: string; api?: TeacherMailboxApi }) {
  const [kind, setKind] = useState<TeacherMailKind>("report");
  const [status, setStatus] = useState<TeacherMailStatus>("received");
  const scope = `${classId}:${kind}:${status}`;
  const [page, setPage] = useState<{ scope: string; items: TeacherMailSummary[]; nextCursor: string | null }>({ scope: "", items: [], nextCursor: null });
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ scope: string; value: TeacherMailDetail } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [resolution, setResolution] = useState("");
  const [processError, setProcessError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const listRequest = useRef(0);
  const lastCursor = useRef<string | undefined>(undefined);
  const detailRequest = useRef(0);
  const savingLock = useRef(false);
  const pendingResolution = useRef<{ key: string; requestId: string } | null>(null);
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const resolutionField = useRef<HTMLTextAreaElement>(null);
  const items = page.scope === scope ? page.items : [];
  const currentDetail = detail?.scope === scope ? detail.value : null;
  const nextCursor = page.scope === scope ? page.nextCursor : null;

  const clearDetail = useCallback(() => {
    detailRequest.current++;
    setSelected(null); setDetail(null); setDetailLoading(false); setDetailError("");
    setResolution(""); setProcessError(""); setSaving(false);
    pendingResolution.current = null; savingLock.current = false;
  }, []);

  const load = useCallback(async (cursor?: string) => {
    const request = ++listRequest.current;
    lastCursor.current = cursor;
    setLoading(true); setListError("");
    try {
      const result = await api.list({ classId, kind, status, ...(cursor ? { cursor } : {}) });
      if (request !== listRequest.current) return;
      setPage((previous) => {
        const previousItems = cursor && previous.scope === scope ? previous.items : [];
        const combined = new Map(previousItems.map((item) => [item.mailId, item]));
        result.items.forEach((item) => combined.set(item.mailId, item));
        return { scope, items: [...combined.values()], nextCursor: result.nextCursor };
      });
    } catch {
      if (request === listRequest.current) setListError("목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      if (request === listRequest.current) setLoading(false);
    }
  }, [api, classId, kind, status, scope]);

  useEffect(() => {
    clearDetail(); setNotice(""); setListError("");
    void load();
    return () => { listRequest.current++; detailRequest.current++; };
  }, [load, clearDetail]);

  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") clearDetail(); };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, [clearDetail]);

  useEffect(() => {
    if (!selected) return;
    detailHeading.current?.focus();
    const timer = window.setTimeout(clearDetail, 5 * 60_000);
    return () => window.clearTimeout(timer);
  }, [selected, clearDetail]);

  function closeDetail() {
    const returnTo = selected;
    clearDetail();
    if (returnTo) rowButtons.current.get(returnTo)?.focus();
  }

  async function openMail(mailId: string) {
    if (savingLock.current) return;
    if (selected === mailId) { closeDetail(); return; }
    clearDetail(); setNotice("");
    const request = ++detailRequest.current;
    setSelected(mailId); setDetailLoading(true);
    try {
      const result = await api.detail({ classId, mailId });
      if (request === detailRequest.current) setDetail({ scope, value: result });
    } catch {
      if (request === detailRequest.current) setDetailError("내용을 불러오지 못했어요. 원문을 닫고 다시 열어 주세요.");
    } finally {
      if (request === detailRequest.current) setDetailLoading(false);
    }
  }

  async function resolveMail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentDetail || savingLock.current) return;
    const text = resolution.trim();
    if (!text) {
      setProcessError("확인한 내용과 조치한 내용을 적어 주세요.");
      resolutionField.current?.focus();
      return;
    }
    const key = `${currentDetail.mailId}:${text}`;
    if (pendingResolution.current?.key !== key) pendingResolution.current = { key, requestId: crypto.randomUUID() };
    savingLock.current = true; setSaving(true); setProcessError(""); setNotice("");
    const request = detailRequest.current;
    try {
      await api.resolve({ classId, mailId: currentDetail.mailId, resolution: text, requestId: pendingResolution.current.requestId });
      if (request !== detailRequest.current) return;
      clearDetail(); setNotice("처리 기록을 저장하고 처리 완료로 표시했어요.");
      void load();
    } catch {
      if (request === detailRequest.current) setProcessError("처리 기록을 저장하지 못했어요. 입력한 내용은 그대로 있으니 다시 시도해 주세요.");
    } finally {
      if (request === detailRequest.current) { savingLock.current = false; setSaving(false); }
    }
  }

  return <section className="teacher-mailbox" aria-labelledby="teacher-mailbox-title">
    <header className="teacher-mailbox-heading">
      <div><h2 id="teacher-mailbox-title" tabIndex={-1}>학생 편지·신고</h2>
        <p>학생이 선생님께 직접 전한 이야기예요. 신고부터 확인해 주세요.</p></div>
      <button type="button" className="small outline" disabled={loading || saving} onClick={() => { clearDetail(); setNotice(""); void load(); }}>목록 새로고침</button>
    </header>
    <p className="teacher-mailbox-privacy">담당 선생님만 확인할 수 있어요. 원문을 열 때마다 열람 기록이 남고, 다른 탭으로 이동하거나 5분이 지나면 원문을 가려요.</p>
    <div className="teacher-mailbox-filter-panel">
      <div className="segmented-track teacher-mailbox-kinds" role="group" aria-label="받은 내용 종류">
        {(["report", "letter"] as const).map((value) => <button key={value} type="button" aria-pressed={kind === value} disabled={saving}
          onClick={() => setKind(value)}>{value === "report" ? "신고" : "편지"}</button>)}
      </div>
      <div className="teacher-mailbox-status-filters" role="group" aria-label="처리 상태">
        {(["received", "resolved"] as const).map((value) => <button key={value} type="button" className={`small outline${status === value ? " is-selected" : ""}`}
          disabled={saving} aria-pressed={status === value} onClick={() => setStatus(value)}>{value === "received" ? "접수된 내용" : "처리 완료"}</button>)}
      </div>
    </div>
    {notice && <p className="message success" role="status">{notice}</p>}
    <div className="teacher-mailbox-list-head"><h3>{status === "received" ? "접수된" : "처리 완료한"} {kindLabels[kind]}</h3>
      <span className="field-help">최근 접수 순 · 한 번에 20건</span></div>
    {loading && items.length === 0 && <p className="teacher-mailbox-empty" role="status">목록을 불러오는 중이에요…</p>}
    {listError && <p className="message error" role="alert">{listError} <button type="button" className="small outline" disabled={loading} onClick={() => void load(lastCursor.current)}>다시 시도</button></p>}
    {!loading && !listError && items.length === 0 && <div className="teacher-mailbox-empty"><strong>{status === "received" ? "접수된" : "처리 완료한"} {kindLabels[kind]}가 없어요.</strong>
      <p>{kind === "report" ? "학생이 신고한 내용은 이곳에서 확인할 수 있어요." : "학생이 보내는 일반 편지가 이곳에 모여요."}</p></div>}
    {items.length > 0 && <ul className="teacher-mailbox-list">
      {items.map((item) => <li key={item.mailId}><button type="button" className={`teacher-mailbox-row${selected === item.mailId ? " is-open" : ""}`}
        ref={(element) => { if (element) rowButtons.current.set(item.mailId, element); else rowButtons.current.delete(item.mailId); }}
        aria-expanded={selected === item.mailId} aria-controls={selected === item.mailId ? "teacher-mailbox-detail" : undefined}
        disabled={saving} onClick={() => void openMail(item.mailId)}>
        <span className={`teacher-mailbox-kind is-${item.kind}`}>{kindLabels[item.kind]}</span>
        <span className="teacher-mailbox-sender"><strong>{item.studentName}</strong><time dateTime={item.createdAt}>{dateLabel(item.createdAt)}</time></span>
        <span className="teacher-mailbox-row-end"><span className="meta-pill">{statusLabels[item.status]}</span><span>{selected === item.mailId ? "내용 닫기 ↑" : "원문 확인 →"}</span></span>
      </button></li>)}
    </ul>}
    {nextCursor && <div className="teacher-mailbox-pagination"><button type="button" className="outline" disabled={loading || saving} onClick={() => void load(nextCursor)}>{loading ? "불러오는 중…" : "이전 내용 더 보기"}</button></div>}
    {selected && <section id="teacher-mailbox-detail" className="teacher-mailbox-detail" aria-labelledby="teacher-mailbox-detail-heading" aria-busy={detailLoading || saving}>
      <div className="teacher-mailbox-detail-head"><h3 ref={detailHeading} id="teacher-mailbox-detail-heading" tabIndex={-1}>{currentDetail?.studentName ?? items.find((item) => item.mailId === selected)?.studentName}의 {kindLabels[kind]}</h3>
        <button type="button" className="small outline" disabled={saving} onClick={closeDetail}>원문 닫기</button></div>
      {detailLoading && <p role="status">원문을 불러오는 중이에요…</p>}
      {detailError && <p className="message error" role="alert">{detailError}</p>}
      {currentDetail && <>
        <div className="teacher-mailbox-detail-meta"><span className="meta-pill">{statusLabels[currentDetail.status]}</span><time dateTime={currentDetail.createdAt}>{dateLabel(currentDetail.createdAt)}</time></div>
        {currentDetail.kind === "letter" && currentDetail.letter && <dl className="teacher-mailbox-fields">
          <div><dt>편지 제목</dt><dd>{currentDetail.letter.subject || "제목 없는 편지"}</dd></div>
          <div><dt>편지 내용</dt><dd>{currentDetail.letter.body}</dd></div>
        </dl>}
        {currentDetail.kind === "report" && currentDetail.report && <dl className="teacher-mailbox-fields">
          <div><dt>1. 누가 · 관련 학생 모두</dt><dd>{currentDetail.report.relatedStudents.length ? currentDetail.report.relatedStudents.join(", ") : "아직 모르겠어요"}</dd></div>
          <div><dt>2. 언제</dt><dd>{currentDetail.report.occurredAt || "아직 모르겠어요"}</dd></div>
          <div><dt>3. 어디에서</dt><dd>{currentDetail.report.location || "아직 모르겠어요"}</dd></div>
          <div><dt>4. 무엇을·어떻게 · 일어난 상황</dt><dd>{currentDetail.report.incident}</dd></div>
          <div><dt>5. 왜 · 알고 있는 이유</dt><dd>{currentDetail.report.reason || "잘 모르겠어요 / 적지 않았어요"}</dd></div>
          <div><dt>6. 목격학생</dt><dd>{currentDetail.report.witnesses.length ? <ul>{currentDetail.report.witnesses.map((witness, index) => <li key={index}>{witness.name}{witness.otherClass ? ` · 다른 반 (${witness.className || "반 미입력"})` : " · 우리 반"}</li>)}</ul> : "없거나 아직 모르겠어요"}</dd></div>
          <div><dt>7. 현재 감정</dt><dd>{currentDetail.report.feelings || "적지 않았어요"}</dd></div>
          <div><dt>8. 원하는 조치</dt><dd>{currentDetail.report.desiredAction || "적지 않았어요"}</dd></div>
          <div><dt>9. 필요한 도움</dt><dd>{currentDetail.report.neededHelp || "적지 않았어요"}</dd></div>
        </dl>}
        {currentDetail.status === "resolved" ? <section className="teacher-mailbox-resolution"><h4>처리 기록 · 교사 전용</h4><p>{currentDetail.resolution || "처리 완료로 기록된 내용이에요."}</p>
          {currentDetail.resolvedAt && <time dateTime={currentDetail.resolvedAt}>{dateLabel(currentDetail.resolvedAt)}</time>}</section>
          : <form className="teacher-mailbox-resolution" onSubmit={(event) => void resolveMail(event)}>
            <h4>확인과 조치 기록</h4><p className="field-help">원문을 읽는 것만으로 처리 완료가 되지 않아요. 필요한 확인과 조치 후 기록해 주세요.</p>
            <label htmlFor="teacher-mail-resolution">처리 기록 <span className="field-help">학생에게 공개되지 않아요.</span></label>
            <textarea ref={resolutionField} id="teacher-mail-resolution" rows={4} maxLength={1000} required value={resolution} disabled={saving}
              aria-describedby={processError ? "teacher-mail-resolution-error teacher-mail-resolution-count" : "teacher-mail-resolution-count"}
              aria-invalid={Boolean(processError)} onChange={(event) => { setResolution(event.target.value); setProcessError(""); }} />
            <small id="teacher-mail-resolution-count" className="field-help">{resolution.length.toLocaleString()} / 1,000자</small>
            {processError && <p id="teacher-mail-resolution-error" className="message error" role="alert">{processError}</p>}
            <div className="teacher-mailbox-resolution-actions"><button type="submit" disabled={saving}>{saving ? "처리 기록 저장 중…" : "기록하고 처리 완료"}</button></div>
          </form>}
      </>}
    </section>}
  </section>;
}
