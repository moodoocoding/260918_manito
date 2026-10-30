import { useCallback, useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, call, db } from "./firebase";
import { balanceGameErrorCode, balanceGameErrorText } from "./balanceGameFeedback";
import { ConfirmDialog } from "./DesignSystem";
import { WorldButton, WorldPageFrame, WorldPageHeader, WorldPaper, WorldPixelIcon } from "./WorldPage";
import "./student-balance-game.css";

type Choice = "A" | "B";
type Question = { id: string; a: string; b: string };
type GameState = { gameId: string | null; questions: Question[]; state: "collecting" | "matching" | "complete" | "failed";
  choices: Choice[] | null; progress: { completedCount: number; participantCount: number } | null;
  partnerName: string | null; canRetry: boolean; canSubmit: boolean; availabilityMessage: string | null };
const previewQuestions: Question[] = [
  {id:"q1",a:"고양이",b:"강아지"},{id:"q2",a:"후라이드 치킨",b:"양념 치킨"},{id:"q3",a:"짬뽕",b:"짜장면"},
  {id:"q4",a:"민트초코 좋아",b:"민트초코 싫어"},{id:"q5",a:"탕수육 찍먹",b:"탕수육 부먹"},{id:"q6",a:"6교시 내내 음악",b:"6교시 내내 미술"},
  {id:"q7",a:"쉬는 시간에 책 읽기",b:"쉬는 시간에 그림 그리기"},{id:"q8",a:"비 오는 날 실내 놀이",b:"맑은 날 운동장 놀이"},
  {id:"q9",a:"수학 퀴즈 풀기",b:"새로운 낱말 배우기"},{id:"q10",a:"소풍에서 보물찾기",b:"소풍에서 자연 관찰"},
];

export function StudentBalanceGame({ preview = false, onBack, onVillageBack, onExit }: {
  roundId?: string; preview?: boolean; onBack?: () => void; onVillageBack?: () => void; onExit?: () => void;
}) {
  const [game, setGame] = useState<GameState | null>(null);
  const [names, setNames] = useState<string[]>(preview ? ["햇살이", "구름이", "초록이"] : []);
  const [index, setIndex] = useState(0);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [realtimeError, setRealtimeError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const questionRef = useRef<HTMLLegendElement>(null);
  const reviewRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const stepMounted = useRef(false);
  const questions = game?.questions ?? previewQuestions;
  useEffect(() => {titleRef.current?.focus();}, []);
  useEffect(() => {
    if (!stepMounted.current) {stepMounted.current = true; return;}
    if (review) reviewRef.current?.focus();
    else questionRef.current?.focus();
  }, [index, review]);
  useEffect(() => {
    if (game?.state === "complete") resultRef.current?.focus();
  }, [game?.state]);
  const refresh = useCallback(async (preserveError = false) => {
    if (preview) return;
    if (!preserveError) setError("");
    try {
      const result = await call<Record<string,never>,GameState>("getStudentBalanceGame", {});
      setGame(result);
      setChoices((draft) => result.choices ?? draft);
      if (result.choices) { setReview(false); setIndex(0); }
    } catch (caught) {
      const invalidSession = ["permission-denied","unauthenticated"].includes(balanceGameErrorCode(caught));
      if (invalidSession) {setGame(null);setChoices([]);setNames([]);}
      if (!preserveError || invalidSession) setError(balanceGameErrorText(caught));
    }
  }, [preview, retry]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (preview || !auth.currentUser || !game?.gameId) return;
    let unsubscribe: () => void = () => {};
    let active = true;
    void auth.currentUser.getIdTokenResult().then(({claims}) => {
      const classId = typeof claims.classId === "string" ? claims.classId : "";
      if (!active || !classId) return;
      unsubscribe = onSnapshot(doc(db, "classes", classId, "balanceGamePublic", "progress"), (snapshot) => {
        const data = snapshot.data();
        if (!data) return;
        setNames(Array.isArray(data.completedNames) ? data.completedNames.filter((name): name is string => typeof name === "string") : []);
        setRealtimeError(false);
        if (typeof data.completedCount === "number" && typeof data.participantCount === "number") {
          setGame((old) => old ? {...old,progress:{completedCount:data.completedCount,participantCount:data.participantCount},
            ...(data.state === "matching" ? {state:"matching",canSubmit:false} : {})} : old);
        }
        if (data.state === "complete" || data.state === "failed") void refresh(data.state === "failed");
      }, () => { setRealtimeError(true); });
    }).catch(() => { setRealtimeError(true); });
    return () => { active = false; unsubscribe(); };
  }, [preview, refresh, game?.gameId]);

  async function submit() {
    if (preview) {
      setGame({gameId:"preview",questions:previewQuestions,state:"complete",choices,progress:{completedCount:16,participantCount:16},partnerName:"구름이",canRetry:false,canSubmit:false,availabilityMessage:null});
      setNames(["햇살이","구름이","초록이","바람이"]);
      setReview(false); return;
    }
    if (choices.length !== questions.length || busy || game?.canSubmit === false) return;
    setBusy(true); setError("");
    try {
      await call<{choices:Choice[]},{submitted:boolean}>("submitBalanceGameChoices", {choices});
      await refresh();
    } catch (caught) {
      setError(balanceGameErrorText(caught));
      await refresh(true);
    } finally { setBusy(false); }
  }
  async function retryMatching() {
    setBusy(true); setError("");
    try { await call<Record<string,never>,{submitted:boolean}>("retryStudentBalanceMatching", {}); await refresh(); }
    catch (caught) { setError(balanceGameErrorText(caught)); await refresh(true); }
    finally { setBusy(false); }
  }

  const current = questions[index];
  const state = preview ? (game?.state ?? "collecting") : game?.state;
  const completedCount = preview ? (game?.progress?.completedCount ?? 3) : (game?.progress?.completedCount ?? names.length);
  const participantCount = preview ? (game?.progress?.participantCount ?? 16) : game?.progress?.participantCount;
  function requestLeave(callback?: () => void) {
    if (!callback || busy) return;
    if (choices.length && !game?.choices) {setPendingLeave(() => callback); return;}
    callback();
  }
  return <WorldPageFrame className="balance-game" ariaLabel="자리바꾸기">
    <WorldPageHeader title="자리바꾸기" titleId="balance-game-title" titleRef={titleRef} icon="desk"
      onBack={() => requestLeave(onVillageBack ?? onBack)} backLabel={onVillageBack ? "마을로 돌아가기" : "게시판으로 돌아가기"}
      onExit={onExit ? () => requestLeave(onExit) : undefined} disabled={busy} />
    <WorldPaper>
      <div className="world-form-content balance-game-content">
        <div className="balance-game-context">
          <p className="world-page-intro">같은 선택이 많은 친구와 짝을 정해요.</p>
          {onVillageBack && onBack && <WorldButton variant="quiet" onClick={() => requestLeave(onBack)} disabled={busy}>게시판으로 돌아가기</WorldButton>}
        </div>
        {(preview || game?.progress) && <div className="world-state balance-game-summary" aria-live="polite">
          <strong>{completedCount}{participantCount ? ` / ${participantCount}` : ""}</strong><span>명이 선택을 마쳤어요</span>
        </div>}
        {!game && !preview && !error && <p role="status" className="world-state">자리바꾸기 정보를 불러오고 있어요…</p>}
        {error && <div className="world-state world-state--error" role="alert"><p>{error}</p>
          <WorldButton variant="secondary" onClick={() => setRetry((n) => n+1)} disabled={busy}>다시 불러오기</WorldButton></div>}
        {game?.availabilityMessage && <div className="world-state world-state--warning" role="status"><p>{game.availabilityMessage}</p>
          <WorldButton variant="secondary" onClick={() => setRetry((n) => n+1)} disabled={busy}>준비 상태 다시 확인</WorldButton></div>}
        {(!game || game.state === "collecting") && !review && (preview || game) && !game?.choices && <WorldPaper className="balance-question"><form onSubmit={(event) => {
          event.preventDefault();
          if (!choices[index]) return;
          if (index < questions.length - 1) setIndex(index+1); else setReview(true);
        }}>
          <div className="balance-question-meta"><strong>질문 {index+1} / {questions.length}</strong><progress max={questions.length} value={index+1}>{index+1}/{questions.length}</progress></div>
          <fieldset><legend ref={questionRef} tabIndex={-1}>마음에 드는 쪽을 골라 주세요.</legend>
            {(["A","B"] as const).map((option) => <label className={`world-state balance-choice ${choices[index] === option ? "is-selected" : ""}`} key={option}>
              <input type="radio" name={`balance-${current?.id}`} value={option} checked={choices[index] === option}
                onChange={() => setChoices((old) => { const next=[...old]; next[index]=option; return next; })} required />
              <span className="balance-choice-copy"><span className="balance-choice-letter">{option}</span><span>{current?.[option === "A" ? "a" : "b"]}</span></span>
            </label>)}
          </fieldset>
          <div className="balance-question-actions">
            <WorldButton variant="secondary" disabled={index===0} onClick={() => setIndex(index-1)}>이전</WorldButton>
            <WorldButton type="submit">{index === questions.length-1 ? "선택 확인" : "다음 질문"}</WorldButton>
          </div>
        </form></WorldPaper>}

        {review && !game?.choices && <WorldPaper className="balance-review"><h2 ref={reviewRef} tabIndex={-1}>내 선택을 확인해요</h2><p>제출하면 선택을 바꿀 수 없어요. 아래 내용이 맞는지 확인해 주세요.</p>
          <ol>{questions.map((question,i) => <li className="world-state" key={question.id}><span>{question.a} 또는 {question.b}</span><strong>{choices[i] === "A" ? question.a : question.b}</strong></li>)}</ol>
          <div className="balance-question-actions"><WorldButton variant="secondary" disabled={busy} onClick={() => {setReview(false);setIndex(0);}}>다시 살펴보기</WorldButton>
            <WorldButton disabled={busy || choices.length !== questions.length || game?.canSubmit === false} onClick={() => void submit()}>{busy ? "저장하고 있어요…" : "선택 제출하기"}</WorldButton></div>
        </WorldPaper>}

        {game?.choices && state !== "complete" && <WorldPaper className="balance-waiting"><div role="status">
          <h2>{game?.canRetry ? "짝을 아직 정하지 못했어요" : state === "matching" ? "친구와 짝을 정하고 있어요" : "선택을 저장했어요"}</h2>
          <p>{game?.canRetry ? "선택은 안전하게 저장되어 있어요. 다시 시도할 수 있어요." : "모든 참가자가 선택을 마치면 내 짝을 알려 드릴게요."}</p>
          </div>{game?.canRetry && <WorldButton onClick={() => void retryMatching()} disabled={busy}>{busy ? "다시 시도하고 있어요…" : "짝 정하기 다시 시도"}</WorldButton>}
        </WorldPaper>}
        {state === "complete" && <WorldPaper className="balance-result"><div aria-live="polite"><WorldPixelIcon name="sprout" /><h2 ref={resultRef} tabIndex={-1}>{preview ? "미리보기 예시 짝" : "오늘의 짝을 만났어요"}</h2>
          <p>{preview ? "화면 예시예요. 실제 학생의 응답이나 AI가 만든 결과가 아니에요." : "밸런스 선택이 비슷한 친구와 짝이 되었어요. 서로의 취향을 알아가는 작은 활동이에요."}</p><strong className="world-state">{game?.partnerName ?? "짝 정보를 불러오고 있어요"}</strong></div></WorldPaper>}
        {(preview || game?.gameId) && <WorldPaper className="balance-game-progress"><section aria-labelledby="balance-progress-title">
          <h2 id="balance-progress-title">선택을 마친 친구</h2>
          {names.length ? <ul>{names.map((name,nameIndex) => <li className="world-state" key={`${name}-${nameIndex}`}>{name}</li>)}</ul> : <p>아직 선택을 마친 친구가 없어요.</p>}
          {realtimeError && <div className="world-state world-state--warning"><p>실시간 목록 연결이 잠시 끊겼어요. 다시 불러와 주세요.</p>
            <WorldButton variant="secondary" onClick={() => setRetry((n) => n+1)} disabled={busy}>다시 불러오기</WorldButton></div>}
        </section></WorldPaper>}
        <p className="balance-game-privacy">내 선택은 나만 볼 수 있어요. 친구에게는 선택을 마쳤다는 이름만 보여요.</p>
      </div>
    </WorldPaper>
    {pendingLeave && <ConfirmDialog title="선택을 지우고 나갈까요?" detail="아직 제출하지 않은 선택이 있어요. 나가면 선택이 지워져요."
      confirmLabel="선택을 지우고 나가기" onCancel={() => setPendingLeave(null)} onConfirm={() => {setPendingLeave(null);pendingLeave();}} />}
  </WorldPageFrame>;
}
