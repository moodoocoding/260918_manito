import { useEffect, useRef, useState } from "react";
import { call } from "./firebase";
import { StudentBalanceGame } from "./StudentBalanceGame";
import { WorldButton, WorldPageFrame, WorldPageHeader, WorldPaper, WorldPixelIcon } from "./WorldPage";
import "./student-community.css";

type Community = {roundId: string; state: "contentOnly"; examples: string[];
  teacherNotice: string | null; postedAt: string | null};

export function StudentCommunity({roundId, preview = false, onMore, showBalanceGameEntry = false, onBack, onExit, classLabel}: {
  roundId?: string; preview?: boolean; onMore?: () => void; showBalanceGameEntry?: boolean;
  onBack?: () => void; onExit?: () => void; classLabel?: string;
}) {
  const [showBalanceGame, setShowBalanceGame] = useState(false);
  const [community, setCommunity] = useState<Community | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const entryRef = useRef<HTMLDivElement>(null);
  const hasOpenedGame = useRef(false);
  const fullPage = !preview || showBalanceGameEntry;
  useEffect(() => {
    if (!fullPage || showBalanceGame) return;
    if (hasOpenedGame.current) entryRef.current?.querySelector("button")?.focus();
    else titleRef.current?.focus();
  }, [fullPage, showBalanceGame]);
  useEffect(() => {
    if (preview) {
      setCommunity({roundId:roundId ?? "preview", state:"contentOnly", examples:["친구의 말을 끝까지 들어 보세요.","함께 쓰는 자리를 사용한 뒤 정리해 보세요."],
        teacherNotice:"함께 쓰는 물건을 사용한 뒤 제자리에 놓아 봅시다.", postedAt:null});
      setError(false);
      return;
    }
    if (!roundId) {
      setCommunity({roundId:"",state:"contentOnly",examples:["친구의 말을 끝까지 들어 보세요.","함께 쓰는 자리를 사용한 뒤 정리해 보세요."],teacherNotice:null,postedAt:null});
      setError(false);
      return;
    }
    let active = true;
    setCommunity(null); setError(false);
    void call<{roundId:string},Community>("getStudentCommunity",{roundId})
      .then((result) => {if(active) setCommunity(result);})
      .catch(() => {if(active) setError(true);});
    return () => {active = false;};
  }, [roundId, retry, preview]);
  if (showBalanceGame) return <StudentBalanceGame preview={preview}
    onBack={() => setShowBalanceGame(false)} onVillageBack={onBack} onExit={onExit} />;
  if (!fullPage) return <WorldPaper className="community-teaser">
    <div className="community-section-head"><h2><WorldPixelIcon name="bulletin" />우리 반 소식</h2>
      {onMore && <WorldButton variant="secondary" onClick={onMore}>우리 반 보기</WorldButton>}</div>
    <p>{community?.teacherNotice ?? "서로 배려하는 방법을 찾아볼까요?"}</p>
    {error && <p className="world-state world-state--error">소식을 불러오지 못했어요. 우리 반 화면에서 다시 확인해 주세요.</p>}
    {!community && !error && <p role="status">소식을 불러오는 중이에요…</p>}
  </WorldPaper>;
  return <WorldPageFrame ariaLabel="우리 반 게시판" className="community-page">
    <WorldPageHeader title="우리 반 게시판" icon="bulletin" titleRef={titleRef}
      onBack={() => onBack?.()} onExit={onExit} />
    <WorldPaper>
      <p className="world-page-intro community-context">{classLabel ?? (preview ? "우리 반 · 예시 학생" : "우리 반")} · 선생님 안내와 친구와 함께할 활동을 살펴봐요.</p>
      <div className="world-form-content community-content">
        <WorldPaper className="community-game-entry">
          <WorldPixelIcon name="desk" size="large" className="community-entry-art" />
          <div className="community-entry-copy"><h2>자리바꾸기</h2><p>질문 10개에 답해요. 모두 선택을 마치면 비슷한 선택을 한 친구와 짝이 돼요.</p></div>
          <div className="community-entry-action" ref={entryRef}><WorldButton onClick={() => {hasOpenedGame.current = true; setShowBalanceGame(true);}}>자리바꾸기 열기</WorldButton></div>
        </WorldPaper>
        {community?.teacherNotice && <WorldPaper className="community-notice">
          <h2><WorldPixelIcon name="envelope" />선생님 안내</h2><p>{community.teacherNotice}</p>
        </WorldPaper>}
        <WorldPaper className="community-ideas">
          <h2><WorldPixelIcon name="sprout" />이렇게 해볼 수 있어요</h2>
          <p>교실에서 실천할 수 있는 배려 아이디어예요.</p>
          {community ? <ul>{community.examples.slice(0,2).map((example) => <li key={example}>{example}</li>)}</ul>
            : <p>친구의 말을 끝까지 듣거나, 함께 쓰는 자리를 정리해 보세요.</p>}
        </WorldPaper>
        {!community && !error && <p className="world-state" role="status">새 소식을 불러오고 있어요…</p>}
        {error && <div className="world-state world-state--error" role="alert"><p>새 소식을 불러오지 못했어요.</p>
          <WorldButton variant="secondary" onClick={() => setRetry((value) => value+1)}>다시 시도</WorldButton></div>}
      </div>
    </WorldPaper>
  </WorldPageFrame>;
}
