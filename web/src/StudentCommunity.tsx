import { useEffect, useState } from "react";
import { call } from "./firebase";

type Community = {roundId: string; state: "contentOnly"; examples: string[];
  teacherNotice: string | null; postedAt: string | null};

export function StudentCommunity({roundId, preview = false, onMore}: {
  roundId: string; preview?: boolean; onMore?: () => void;
}) {
  const [community, setCommunity] = useState<Community | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setCommunity(null); setError(false);
    void call<{roundId:string},Community>("getStudentCommunity",{roundId})
      .then((result) => {if(active) setCommunity(result);})
      .catch(() => {if(active) setError(true);});
    return () => {active = false;};
  }, [roundId, retry]);
  if (preview) return <section className="panel student-community-preview">
    <div className="community-preview-head">
      <div>
        <span className="context-badge is-sage">학급 배려 안내</span>
        <h2>우리 반 소식</h2>
      </div>
      <button className="small outline" onClick={onMore}>우리 반 보기</button>
    </div>
    {community?.teacherNotice ? <p className="community-notice-box">{community.teacherNotice}</p> : <p>서로 배려하는 방법을 찾아볼까요?</p>}
    {error && <p className="field-help">소식을 불러오지 못했어요. 우리 반 화면에서 다시 확인해 주세요.</p>}
    {!community && !error && <p role="status">소식을 불러오는 중이에요…</p>}
  </section>;
  return <div className="student-activities">
    {community?.teacherNotice && <section className="panel community-teacher-panel"><span className="eyebrow">선생님 말씀</span><h2>선생님 안내</h2><p className="community-notice-box">{community.teacherNotice}</p></section>}
    <section className="panel">
      <div className="panel-section-head">
        <span className="context-badge is-sage">배려 아이디어</span>
        <h2>이렇게 해볼 수 있어요</h2>
        <p className="field-help">교실에서 실천할 수 있는 활동 아이디어예요. 다른 학생의 기록이나 인기 미션이 아니에요.</p>
      </div>
      {community ? <ul className="student-example-list">{community.examples.slice(0,2).map((example) => <li key={example}>{example}</li>)}</ul>
        : <p>친구의 말을 끝까지 듣거나, 함께 쓰는 자리를 정리해 보세요.</p>}
    </section>
    {error && <section className="panel"><p className="message error" role="alert">새 소식을 불러오지 못했어요.</p><button className="outline" onClick={() => setRetry((value) => value+1)}>다시 시도</button></section>}
  </div>;
}
