import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { ConfirmDialog } from "./DesignSystem";
import { WorldButton, WorldPageFrame, WorldPageHeader, WorldPaper, WorldPixelIcon } from "./WorldPage";
import type { CreateTeacherMailInput, CreateTeacherMailResult, TeacherMailKind, TeacherMailLetter, TeacherMailReport, TeacherMailWitness } from "./teacherMailTypes";

type StudentRow = { id: string; name: string };
type WitnessRow = TeacherMailWitness & { id: string; className: string };
type ReportDraft = Omit<TeacherMailReport, "relatedStudents" | "witnesses"> & { relatedStudents: StudentRow[]; witnesses: WitnessRow[] };
export type TeacherMailboxDraft = {
  view: "choices" | "writing" | "review";
  kind: TeacherMailKind | null;
  step: number;
  returnToReview: boolean;
  letter: TeacherMailLetter;
  report: ReportDraft;
  requestIds: Record<TeacherMailKind, string | null>;
};

const studentRow = (): StudentRow => ({ id: crypto.randomUUID(), name: "" });
const witnessRow = (): WitnessRow => ({ id: crypto.randomUUID(), name: "", otherClass: false, className: "" });

export function StudentTeacherMailboxPending({ onBack, onExit }: { onBack: () => void; onExit: () => void }) {
  return <WorldPageFrame ariaLabel="비밀 우체통 준비 안내">
    <WorldPageHeader title="비밀 우체통" icon="envelope" onBack={onBack} onExit={onExit} />
    <WorldPaper><section className="world-section">
      <h2>우체통을 준비하고 있어요</h2>
      <p>아직은 여기서 편지나 신고를 보낼 수 없어요.<br />도움이 필요하면 선생님께 직접 말씀해 주세요.</p>
    </section></WorldPaper>
  </WorldPageFrame>;
}

export function emptyTeacherMailboxDraft(): TeacherMailboxDraft {
  return {
    view: "choices", kind: null, step: 0, returnToReview: false,
    letter: { subject: "", body: "" },
    report: { relatedStudents: [studentRow()], occurredAt: "", location: "", incident: "", reason: "", witnesses: [witnessRow()], feelings: "", desiredAction: "", neededHelp: "" },
    requestIds: { letter: null, report: null },
  };
}

export function isTeacherMailboxDraftDirty(draft: TeacherMailboxDraft): boolean {
  const { report, letter } = draft;
  return Boolean(letter.subject.trim() || letter.body.trim()
    || report.relatedStudents.some((row) => row.name.trim())
    || report.witnesses.some((row) => row.name.trim() || row.className.trim())
    || [report.occurredAt, report.location, report.incident, report.reason, report.feelings, report.desiredAction, report.neededHelp].some((text) => text.trim()));
}

const reportSteps = [
  { label: "누가", title: "누가 관련되어 있나요?", hint: "일에 관련된 학생을 모두 적어 주세요. 이름을 모르면 아는 만큼만 적어도 괜찮아요." },
  { label: "언제", title: "언제 있었던 일인가요?", hint: "날짜나 시간을 정확히 몰라도 괜찮아요. ‘어제 점심시간’처럼 적어 주세요." },
  { label: "어디에서", title: "어디에서 있었던 일인가요?", hint: "교실, 복도, 운동장처럼 기억나는 장소를 적어 주세요." },
  { label: "무엇을 · 어떻게", title: "어떤 일이 있었나요?", hint: "무슨 일이 어떻게 일어났는지 차근차근 적어 주세요. 직접 본 일과 들은 이야기를 구분해 주면 도움이 돼요." },
  { label: "왜", title: "이유를 알고 있나요?", hint: "알고 있는 이유가 있다면 적어 주세요. 추측해서 쓰지 않아도 되고, 이유를 몰라도 괜찮아요." },
  { label: "목격학생", title: "일을 본 학생이 있나요?", hint: "목격한 학생이 있다면 적어 주세요. 다른 반 친구라면 몇 반인지도 적어 주세요." },
  { label: "현재 감정", title: "지금 어떤 마음인가요?", hint: "지금 느끼는 감정을 골라 보거나, 내 말로 적어 주세요." },
  { label: "원하는 조치", title: "어떻게 해 주면 좋겠나요?", hint: "선생님이 어떻게 해 주기를 바라는지 적어 주세요. 아직 모르겠어도 괜찮아요." },
  { label: "필요한 도움", title: "어떤 도움이 필요한가요?", hint: "지금 나에게 필요한 도움을 적어 주세요. 선생님과 함께 생각해 보고 싶다고 해도 좋아요." },
] as const;
const emotionChoices = ["속상해요", "화가 나요", "무서워요", "걱정돼요", "괜찮아요", "잘 모르겠어요"];
type ValidationError = { field: string; message: string };
type TextReportKey = "occurredAt" | "location" | "incident" | "reason" | "feelings" | "desiredAction" | "neededHelp";

function reportPayload(draft: ReportDraft): TeacherMailReport {
  return {
    ...draft,
    relatedStudents: draft.relatedStudents.map((row) => row.name.trim()).filter(Boolean),
    witnesses: draft.witnesses.filter((row) => row.name.trim()).map((row) => ({
      name: row.name.trim(), otherClass: row.otherClass,
      ...(row.otherClass ? { className: row.className.trim() } : {}),
    })),
  };
}

export function StudentTeacherMailbox({ draftRef, onSubmit, onBack, onExit, onBusyChange, preview = false }: {
  draftRef: RefObject<TeacherMailboxDraft>;
  onSubmit: (input: CreateTeacherMailInput) => Promise<CreateTeacherMailResult>;
  onBack: () => void;
  onExit?: () => void;
  onBusyChange?: (busy: boolean) => void;
  preview?: boolean;
}) {
  const [draft, setDraft] = useState(() => draftRef.current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ValidationError | null>(null);
  const [sentKind, setSentKind] = useState<TeacherMailKind | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const sending = useRef(false);
  const mounted = useRef(true);
  const stepTitle = useRef<HTMLHeadingElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const nextField = useRef<string | null>(null);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (draft.view !== "choices" || sentKind) stepTitle.current?.focus();
  }, [draft.view, draft.kind, draft.step, sentKind]);
  useEffect(() => { if (error) feedback.current?.focus(); }, [error]);
  useEffect(() => {
    if (nextField.current) document.getElementById(nextField.current)?.focus();
    nextField.current = null;
  }, [draft.report.relatedStudents, draft.report.witnesses]);

  function update(change: (current: TeacherMailboxDraft) => TeacherMailboxDraft) {
    const next = change(draftRef.current);
    draftRef.current = next;
    setDraft(next);
  }
  function changeLetter(key: keyof TeacherMailLetter, value: string) {
    setError(null);
    update((current) => ({ ...current, letter: { ...current.letter, [key]: value }, requestIds: { ...current.requestIds, letter: null } }));
  }
  function changeReport(change: (current: ReportDraft) => ReportDraft) {
    setError(null);
    update((current) => ({ ...current, report: change(current.report), requestIds: { ...current.requestIds, report: null } }));
  }
  function setReportText(key: TextReportKey, value: string) { changeReport((current) => ({ ...current, [key]: value })); }
  function addStudent() {
    const row = studentRow();
    nextField.current = `tm-person-${row.id}`;
    changeReport((current) => ({ ...current, relatedStudents: [...current.relatedStudents, row] }));
  }
  function removeStudent(id: string) {
    const rows = draftRef.current.report.relatedStudents;
    const index = rows.findIndex((row) => row.id === id);
    const nextRows = rows.length === 1 ? [{ ...rows[0], name: "" }] : rows.filter((row) => row.id !== id);
    nextField.current = `tm-person-${nextRows[Math.min(index, nextRows.length - 1)].id}`;
    changeReport((current) => ({ ...current, relatedStudents: nextRows }));
  }
  function addWitness() {
    const row = witnessRow();
    nextField.current = `tm-witness-name-${row.id}`;
    changeReport((current) => ({ ...current, witnesses: [...current.witnesses, row] }));
  }
  function removeWitness(id: string) {
    const rows = draftRef.current.report.witnesses;
    const index = rows.findIndex((row) => row.id === id);
    const nextRows = rows.length === 1 ? [{ ...rows[0], name: "", otherClass: false, className: "" }] : rows.filter((row) => row.id !== id);
    nextField.current = `tm-witness-name-${nextRows[Math.min(index, nextRows.length - 1)].id}`;
    changeReport((current) => ({ ...current, witnesses: nextRows }));
  }
  function choose(kind: TeacherMailKind) {
    setError(null);
    update((current) => ({ ...current, kind, view: "writing", step: 0, returnToReview: false }));
  }
  function validateReport(step?: number): ValidationError | null {
    if ((step === undefined || step === 3) && !draftRef.current.report.incident.trim()) return { field: "incident", message: "어떤 일이 있었는지 조금만 적어 주세요. 이 내용은 꼭 필요해요." };
    if (step === undefined || step === 5) {
      const witness = draftRef.current.report.witnesses.find((row) => row.name.trim() && row.otherClass && !row.className.trim());
      if (witness) return { field: `witness-class-${witness.id}`, message: "다른 반 목격학생이 몇 반인지 적어 주세요. 모르면 ‘반을 몰라요’라고 적어도 괜찮아요." };
      const noName = draftRef.current.report.witnesses.find((row) => !row.name.trim() && row.className.trim());
      if (noName) return { field: `witness-name-${noName.id}`, message: "목격학생 이름을 적어 주세요. 이름을 모르면 ‘이름을 몰라요’라고 적어도 괜찮아요." };
    }
    return null;
  }
  function validateAll(): ValidationError | null {
    return draftRef.current.kind === "letter"
      ? !draftRef.current.letter.body.trim() ? { field: "body", message: "선생님께 전하고 싶은 내용을 적어 주세요." } : null
      : validateReport();
  }
  function next(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    const problem = draft.kind === "letter" ? validateAll() : validateReport(draft.step);
    if (problem) { setError(problem); return; }
    setError(null);
    update((current) => current.kind === "letter" || current.step === 8 || current.returnToReview
      ? { ...current, view: "review", returnToReview: false }
      : { ...current, step: current.step + 1 });
  }
  function previous() {
    setError(null);
    update((current) => current.returnToReview ? { ...current, view: "review", returnToReview: false }
      : current.kind === "report" && current.step > 0 ? { ...current, step: current.step - 1 }
        : { ...current, view: "choices" });
  }
  function edit(step = 0) {
    setError(null);
    update((current) => ({ ...current, view: "writing", step, returnToReview: true }));
  }
  function leave() {
    if (sending.current) return;
    if (isTeacherMailboxDraftDirty(draftRef.current)) setConfirmExit(true);
    else { draftRef.current = emptyTeacherMailboxDraft(); onBack(); }
  }
  async function send() {
    if (sending.current || !draftRef.current.kind) return;
    const problem = validateAll();
    if (problem) { setError(problem); return; }
    sending.current = true;
    onBusyChange?.(true);
    setBusy(true);
    setError(null);
    const current = draftRef.current;
    const kind = current.kind!;
    const requestId = current.requestIds[kind] ?? crypto.randomUUID();
    update((value) => ({ ...value, requestIds: { ...value.requestIds, [kind]: requestId } }));
    const input: CreateTeacherMailInput = kind === "letter"
      ? { kind, requestId, letter: { subject: current.letter.subject.trim(), body: current.letter.body.trim() } }
      : { kind, requestId, report: reportPayload(current.report) };
    try {
      await onSubmit(input);
      if (!mounted.current) return;
      update(() => emptyTeacherMailboxDraft());
      setSentKind(kind);
    } catch {
      if (mounted.current) setError({ field: "send", message: "보내지 못했어요. 작성한 내용은 그대로 있어요. 연결 상태를 확인하고 다시 보내 주세요." });
    } finally {
      sending.current = false;
      if (mounted.current) { setBusy(false); onBusyChange?.(false); }
    }
  }

  const currentStep = reportSteps[draft.step];
  const report = draft.report;
  const reviewReport = reportPayload(report);
  const summaryValues = [
    reviewReport.relatedStudents.join(", "), reviewReport.occurredAt, reviewReport.location,
    reviewReport.incident, reviewReport.reason,
    reviewReport.witnesses.map((row) => `${row.name} (${row.otherClass ? row.className : "우리 반"})`).join("\n"),
    reviewReport.feelings, reviewReport.desiredAction, reviewReport.neededHelp,
  ];
  const invalid = (field: string) => error?.field === field || undefined;
  const fieldDescription = (field: string, hint: string) => `${hint}${invalid(field) ? " teacher-mail-error" : ""}`;

  function reportText(key: TextReportKey, label: string, maximum: number, placeholder: string, rows = 4) {
    return <div className="world-field tm-field">
      <label htmlFor={`tm-${key}`}>{label} {key === "incident" ? <span className="tm-required">꼭 적어 주세요</span> : <span className="tm-optional">선택</span>}</label>
      <textarea id={`tm-${key}`} value={report[key]} rows={rows} maxLength={maximum} disabled={busy}
        aria-invalid={invalid(key)} aria-describedby={fieldDescription(key, `tm-${key}-count`)}
        placeholder={placeholder} onChange={(event) => setReportText(key, event.target.value)} />
      <span className="tm-count" id={`tm-${key}-count`}>{report[key].length.toLocaleString()} / {maximum.toLocaleString()}자</span>
    </div>;
  }

  return <WorldPageFrame className="student-teacher-mailbox" ariaLabel="선생님께 보내는 비밀 우체통">
    <WorldPageHeader title="비밀 우체통" icon="envelope" onBack={leave} onExit={onExit} disabled={busy} />
    <WorldPaper><div className={draft.view === "choices" && !sentKind ? "tm-content" : "world-form-content"}>
    {preview && <p className="world-state tm-preview-note">미리보기예요. 예시로 작성하고 보내 볼 수 있지만 실제 선생님께 전달되지는 않아요.</p>}

    {sentKind ? <div className="tm-success">
      <WorldPixelIcon name="envelope" className="tm-success-icon" />
      <h2 ref={stepTitle} tabIndex={-1}>{preview ? "예시 전송을 마쳤어요" : sentKind === "report" ? "선생님께 신고 내용을 보냈어요" : "선생님께 편지를 보냈어요"}</h2>
      <p>{preview ? "실제 편지나 신고는 전달되지 않았어요." : "내용이 접수됐어요. 선생님이 확인하고 살펴보실 거예요."}</p>
      {!preview && <p className="world-state tm-gentle-note">지금 바로 도움이 필요하면 가까운 선생님께 직접 알려 주세요.</p>}
      <div className="tm-actions"><WorldButton type="button" variant="secondary" onClick={() => setSentKind(null)}>우체통으로</WorldButton><WorldButton type="button" variant="primary" onClick={onBack}>마을로 돌아가기</WorldButton></div>
    </div> : draft.view === "choices" ? <>
      <div className="tm-intro"><h2>어떤 이야기를 전할까요?</h2><p>담당 선생님께 전달되고, 다른 친구에게는 공개되지 않아요.<br />선생님은 누가 보냈는지 확인할 수 있어요.</p></div>
      <div className="tm-choices">
        <WorldButton type="button" variant="secondary" className="tm-choice tm-choice-letter world-choice-card" aria-label="편지 보내기" onClick={() => choose("letter")}>
          <WorldPixelIcon name="envelope" className="tm-choice-symbol" /><strong>편지 보내기</strong><span>전하고 싶은 이야기나 궁금한 점을<br />선생님께 편지로 보내요.</span>{Boolean(draft.letter.body || draft.letter.subject) && <small>작성 중인 내용이 있어요</small>}<b className="world-card-action" aria-hidden="true">편지 쓰기 →</b>
        </WorldButton>
        <WorldButton type="button" variant="secondary" className="tm-choice tm-choice-report world-choice-card" aria-label="신고하기" onClick={() => choose("report")}>
          <WorldPixelIcon name="clipboard" className="tm-choice-symbol" /><strong>신고하기</strong><span>사건이나 사고, 걱정되는 일을<br />하나씩 차근차근 알려요.</span>{isTeacherMailboxDraftDirty({ ...draft, letter: { subject: "", body: "" } }) && <small>작성 중인 내용이 있어요</small>}<b className="world-card-action" aria-hidden="true">신고 내용 적기 →</b>
        </WorldButton>
      </div>
      <p className="world-state tm-gentle-note">지금 바로 도움이 필요하면 가까운 선생님께 직접 알려 주세요.</p>
    </> : <div className="tm-form">
      <div className="tm-form-context"><span>{draft.kind === "letter" ? "편지 보내기" : "신고하기"}</span><span>{draft.view === "review" ? "보내기 전 확인" : draft.kind === "report" ? `${draft.step + 1} / 9단계` : "내용 작성"}</span></div>
      {draft.kind === "report" && <progress className="tm-progress" max={9} value={draft.view === "review" ? 9 : draft.step + 1} aria-label="신고 작성 단계" />}
      {error && <div className="world-state world-state--error tm-error" id="teacher-mail-error" role="alert" ref={feedback} tabIndex={-1}>{error.message}</div>}

      {draft.view === "review" ? <>
        <div className="tm-step-head"><h2 ref={stepTitle} tabIndex={-1}>이대로 선생님께 보낼까요?</h2><p>내용을 살펴보고, 바꾸고 싶은 곳은 수정해 주세요.</p></div>
        <p className="world-state tm-recipient">받는 사람 <strong>담당 선생님</strong></p>
        <dl className="tm-review">
          {draft.kind === "letter" ? <>
            <div><dt>제목 <WorldButton type="button" variant="quiet" className="tm-edit" disabled={busy} onClick={() => edit()}>편지 수정</WorldButton></dt><dd>{draft.letter.subject.trim() || "제목 없이 보내요"}</dd></div>
            <div><dt>편지 내용</dt><dd>{draft.letter.body}</dd></div>
          </> : reportSteps.map((step, index) => <div key={step.label}><dt>{index + 1}. {step.label}<WorldButton type="button" variant="quiet" className="tm-edit" disabled={busy} onClick={() => edit(index)} aria-label={`${step.label} 수정`}>수정</WorldButton></dt><dd>{summaryValues[index].trim() || "적지 않았어요"}</dd></div>)}
        </dl>
        <p className="tm-private-note">선생님은 보낸 사람이 누구인지 확인할 수 있어요. 다른 친구에게는 공개되지 않아요.</p>
        <div className="tm-actions"><WorldButton type="button" variant="secondary" onClick={() => edit(draft.kind === "report" ? 8 : 0)} disabled={busy}>이전으로</WorldButton><WorldButton type="button" variant="primary" onClick={() => { void send(); }} disabled={busy} aria-busy={busy}>{busy ? "보내는 중…" : preview ? "예시로 보내기" : "선생님께 보내기"}</WorldButton></div>
      </> : <form onSubmit={next} noValidate>
        <div className="tm-step-head"><h2 ref={stepTitle} tabIndex={-1}>{draft.kind === "letter" ? "선생님께 편지를 써요" : currentStep.title}</h2><p>{draft.kind === "letter" ? "편안하게 내 이야기를 적어 주세요." : currentStep.hint}</p></div>
        {draft.kind === "letter" ? <>
          <div className="world-field tm-field"><label htmlFor="tm-subject">편지 제목 <span className="tm-optional">선택</span></label><input id="tm-subject" value={draft.letter.subject} maxLength={80} disabled={busy} placeholder="어떤 이야기를 전하고 싶나요?" onChange={(event) => changeLetter("subject", event.target.value)} /></div>
          <div className="world-field tm-field"><label htmlFor="tm-body">편지 내용 <span className="tm-required">꼭 적어 주세요</span></label><textarea id="tm-body" value={draft.letter.body} maxLength={4000} rows={10} disabled={busy} placeholder="선생님께 전하고 싶은 말을 적어 주세요." aria-invalid={invalid("body")} aria-describedby={fieldDescription("body", "tm-body-count")} onChange={(event) => changeLetter("body", event.target.value)} /><span className="tm-count" id="tm-body-count">{draft.letter.body.length.toLocaleString()} / 4,000자</span></div>
        </> : <>
          {draft.step === 0 && <fieldset className="tm-people"><legend>관련 학생 모두 <span className="tm-optional">선택 · 최대 40명</span></legend>
            {report.relatedStudents.map((row, index) => <div className="world-field tm-person-row" key={row.id}><label htmlFor={`tm-person-${row.id}`}>학생 {index + 1} 이름<input id={`tm-person-${row.id}`} value={row.name} maxLength={80} disabled={busy} placeholder="이름 또는 아는 만큼 적기" onChange={(event) => changeReport((current) => ({ ...current, relatedStudents: current.relatedStudents.map((item) => item.id === row.id ? { ...item, name: event.target.value } : item) }))} /></label><WorldButton type="button" variant="quiet" className="tm-remove" aria-label={`관련 학생 ${index + 1} 지우기`} onClick={() => removeStudent(row.id)}>지우기</WorldButton></div>)}
            <WorldButton type="button" variant="secondary" className="tm-add" disabled={report.relatedStudents.length >= 40} onClick={addStudent}>+ 관련 학생 추가</WorldButton>
          </fieldset>}
          {draft.step === 1 && reportText("occurredAt", "일이 있었던 때", 200, "예: 어제 점심시간, 지난주 금요일 하교할 때", 3)}
          {draft.step === 2 && reportText("location", "일이 있었던 곳", 200, "예: 3층 복도, 운동장 그네 옆", 3)}
          {draft.step === 3 && reportText("incident", "일어난 일과 상황", 6000, "처음부터 기억나는 순서대로 적어 주세요. 길게 적어도 괜찮아요.", 12)}
          {draft.step === 4 && reportText("reason", "알고 있는 이유", 1000, "아는 내용만 적어 주세요. 몰라도 괜찮아요.", 5)}
          {draft.step === 5 && <fieldset className="tm-people"><legend>목격학생 <span className="tm-optional">선택 · 최대 40명</span></legend>
            {report.witnesses.map((row, index) => <div className="tm-witness-row" key={row.id}>
              <div className="world-field tm-person-row"><label htmlFor={`tm-witness-name-${row.id}`}>목격학생 {index + 1} 이름<input id={`tm-witness-name-${row.id}`} value={row.name} maxLength={80} placeholder="일을 본 학생 이름" aria-invalid={invalid(`witness-name-${row.id}`)} aria-describedby={invalid(`witness-name-${row.id}`) ? "teacher-mail-error" : undefined} onChange={(event) => changeReport((current) => ({ ...current, witnesses: current.witnesses.map((item) => item.id === row.id ? { ...item, name: event.target.value } : item) }))} /></label><WorldButton type="button" variant="quiet" className="tm-remove" aria-label={`목격학생 ${index + 1} 지우기`} onClick={() => removeWitness(row.id)}>지우기</WorldButton></div>
              <label className="tm-checkbox"><input type="checkbox" checked={row.otherClass} onChange={(event) => changeReport((current) => ({ ...current, witnesses: current.witnesses.map((item) => item.id === row.id ? { ...item, otherClass: event.target.checked, className: "" } : item) }))} /><span>다른 반 친구예요</span></label>
              {row.otherClass && <div className="world-field tm-field tm-witness-class"><label htmlFor={`tm-witness-class-${row.id}`}>목격학생 {index + 1}의 반 <span className="tm-required">다른 반이면 꼭 적어 주세요</span></label><input id={`tm-witness-class-${row.id}`} value={row.className} maxLength={80} placeholder="예: 3학년 4반 / 반을 몰라요" aria-invalid={invalid(`witness-class-${row.id}`)} aria-describedby={invalid(`witness-class-${row.id}`) ? "teacher-mail-error" : undefined} onChange={(event) => changeReport((current) => ({ ...current, witnesses: current.witnesses.map((item) => item.id === row.id ? { ...item, className: event.target.value } : item) }))} /></div>}
            </div>)}
            <WorldButton type="button" variant="secondary" className="tm-add" disabled={report.witnesses.length >= 40} onClick={addWitness}>+ 목격학생 추가</WorldButton>
          </fieldset>}
          {draft.step === 6 && <><div className="tm-emotions" role="group" aria-label="현재 감정 빠르게 고르기">{emotionChoices.map((choice) => <WorldButton key={choice} variant={report.feelings === choice ? "primary" : "secondary"} type="button" aria-pressed={report.feelings === choice} onClick={() => setReportText("feelings", choice)}>{choice}</WorldButton>)}</div>{reportText("feelings", "지금 내 마음", 1000, "고른 감정에 이야기를 더 적거나, 내 말로 적어도 좋아요.", 4)}</>}
          {draft.step === 7 && reportText("desiredAction", "선생님께 바라는 조치", 1000, "예: 따로 이야기하고 싶어요. / 다시 일어나지 않게 도와주세요.", 5)}
          {draft.step === 8 && reportText("neededHelp", "지금 필요한 도움", 1000, "예: 선생님과 함께 생각하고 싶어요. / 잠깐 쉴 곳이 필요해요.", 5)}
          {draft.step !== 3 && <p className="tm-optional-note">모르거나 적기 어려우면 비워 두고 다음으로 가도 괜찮아요.</p>}
        </>}
        <div className="tm-actions"><WorldButton type="button" variant="secondary" onClick={previous} disabled={busy}>{draft.returnToReview ? "확인 화면으로" : draft.kind === "report" && draft.step > 0 ? "이전" : "선택으로 돌아가기"}</WorldButton><WorldButton type="submit" variant="primary" disabled={busy}>{draft.returnToReview || draft.kind === "letter" || draft.step === 8 ? "내용 확인하기" : "다음"}</WorldButton></div>
      </form>}
    </div>}
    </div></WorldPaper>
    {confirmExit && <ConfirmDialog title="작성 중인 내용을 지울까요?" detail="아직 보내지 않았어요. 마을로 돌아가면 작성 중인 편지와 신고 내용이 지워져요." confirmLabel="지우고 마을로 돌아가기" onCancel={() => setConfirmExit(false)} onConfirm={() => { draftRef.current = emptyTeacherMailboxDraft(); setConfirmExit(false); onBack(); }} />}
  </WorldPageFrame>;
}
