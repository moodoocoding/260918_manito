import { useEffect, useRef } from "react";
import { expansionSpaces, type ExpansionSpaceId } from "./expansionSpaces";
import { WorldButton, WorldPageFrame, WorldPageHeader, WorldPaper, WorldPixelIcon } from "./WorldPage";
import "./student-expansion-space.css";

export function StudentExpansionSpace({ spaceId, onBack, onExit, preview = false }: {
  spaceId: ExpansionSpaceId;
  onBack: () => void;
  onExit?: () => void;
  preview?: boolean;
}) {
  const space = expansionSpaces[spaceId];
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, [spaceId]);

  return <WorldPageFrame className="student-expansion-space" ariaLabel={space.title}>
    <WorldPageHeader title={space.title} icon="sprout" onBack={onBack}
      onExit={preview ? undefined : onExit} titleRef={titleRef} />
    <WorldPaper>
      <p className="world-page-intro">{preview ? "예시 학급 · " : ""}새로운 활동을 준비하는 공간이에요.</p>
      <div className="world-form-content expansion-space-waiting">
        <WorldPixelIcon name="sprout" />
        <span className="world-state">준비 중</span>
        <h2>아직 활동이 열리지 않았어요</h2>
        <p>마을의 다른 곳을 둘러보며 기다려 주세요.</p>
        <WorldButton onClick={onBack}>마을 둘러보기</WorldButton>
      </div>
    </WorldPaper>
  </WorldPageFrame>;
}
