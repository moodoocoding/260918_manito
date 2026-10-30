import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import worldTown from "./assets/world-town-v2.webp";
import worldEast from "./assets/world-town-east-v1.webp";
import worldAvatar from "./assets/world-avatar-v2.webp";
import { useWorldMovement, type WorldDirection } from "./useWorldMovement";
import { expansionSpaceIds, expansionSpaces, WORLD_RIGHT_EDGE, WORLD_SIZE, worldPercent, type ExpansionSpaceId } from "./expansionSpaces";

type StudentDestination = "today-tasks" | "manitto" | "mail" | "community" | ExpansionSpaceId;
type WorldDestination = {
  id: StudentDestination | "today";
  title: string;
  description: string;
  x: number;
  signY: number;
  signX?: number;
  area: { left: number; top: number; width: number; height: number };
  page: StudentDestination;
};

const destinations: WorldDestination[] = [
  { id: "today", title: "오늘 할 일", description: "오늘의 활동을 확인해요", x: 16, signY: 28, area: { left: 1, top: 29, width: 27, height: 50 },
    page: "today-tasks" },
  { id: "mail", title: "비밀 우체통", description: "선생님께 편지나 신고를 보내요", x: 65, signY: 45, area: { left: 58, top: 48, width: 17, height: 31 }, page: "mail" },
  { id: "community", title: "우리 반 게시판", description: "우리 반 소식을 살펴봐요", x: 87, signY: 43, area: { left: 80, top: 45, width: 18, height: 32 }, page: "community" },
  { ...expansionSpaces["space-1"], id: "manitto", title: "마니또", description: "비밀친구 활동과 미션을 확인해요", page: "manitto" },
  ...expansionSpaceIds.filter((id) => id !== "space-1").map((id): WorldDestination => ({ id, ...expansionSpaces[id], description: "새로운 활동을 준비하는 공간", page: id })),
];
const interactionRange = 6;

export function StudentClassroom({ className, onNavigate, initialPosition = 8, onPositionChange, onExit }: {
  className: string;
  onNavigate: (page: StudentDestination) => void;
  initialPosition?: number;
  onPositionChange?: (position: number) => void;
  onExit?: () => void;
}) {
  const movement = useWorldMovement(initialPosition, onPositionChange, WORLD_RIGHT_EDGE);
  const { position, facing, walking, target } = movement;
  const viewportRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const nearby = destinations.find((place) => Math.abs(position - place.x) <= interactionRange);
  const canInteract = Boolean(nearby) && !walking;
  const destination = destinations.find((place) => place.x === target);

  function enter(place: WorldDestination) {
    if (movement.isMoving() || Math.abs(movement.positionRef.current - place.x) > interactionRange) {
      movement.walkTo(place.x);
      return;
    }
    movement.stop();
    onNavigate(place.page);
  }

  function handleMapKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    if (key === "arrowleft" || key === "a") { event.preventDefault(); movement.beginManual("left"); }
    else if (key === "arrowright" || key === "d") { event.preventDefault(); movement.beginManual("right"); }
    else if ((key === "e" || (key === "enter" && event.target === event.currentTarget)) && nearby) { event.preventDefault(); if (canInteract) enter(nearby); }
  }

  function startGroundPointer(event: PointerEvent<HTMLDivElement>) {
    pointerStart.current = event.target === event.currentTarget && event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
  }

  function endGroundPointer(event: PointerEvent<HTMLDivElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.focus({ preventScroll: true });
    if ((event.clientY - bounds.top) / bounds.height < .78) return;
    movement.walkTo((event.clientX - bounds.left) / bounds.width * WORLD_SIZE);
  }

  function beginPointerMove(event: PointerEvent<HTMLButtonElement>, direction: WorldDirection) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    movement.beginManual(direction);
  }

  function stepFromKeyboard(event: MouseEvent<HTMLButtonElement>, direction: WorldDirection) {
    if (event.detail === 0) movement.step(direction);
  }

  useEffect(() => {
    const followAvatar = () => {
      const viewport = viewportRef.current;
      const avatar = avatarRef.current;
      if (!viewport || !avatar || viewport.scrollWidth <= viewport.clientWidth) return;
      const left = avatar.offsetLeft;
      const right = left + avatar.offsetWidth;
      const padding = 80;
      if (left < viewport.scrollLeft + padding) viewport.scrollTo({ left: Math.max(0, left - padding) });
      else if (right > viewport.scrollLeft + viewport.clientWidth - padding) {
        viewport.scrollTo({ left: right - viewport.clientWidth + padding });
      }
    };
    followAvatar();
    window.addEventListener("resize", followAvatar);
    return () => window.removeEventListener("resize", followAvatar);
  }, [position]);

  return <div className="student-classroom raster-world">
    <header className="classroom-heading">
      <div>
        <span className="context-badge is-sage">{className}</span>
        <h1 className="student-page-title" tabIndex={-1}>우리 반 월드</h1>
        <p>오늘은 어디로 가 볼까요?</p>
      </div>
    </header>

    <section className="classroom-map" aria-label="우리 반 도트 마을 지도">
      <div className="classroom-world-viewport" ref={viewportRef}>
        <div className="classroom-scene" role="group" tabIndex={0} onKeyDown={handleMapKeyDown}
          onPointerDown={startGroundPointer} onPointerUp={endGroundPointer} onPointerCancel={() => { pointerStart.current = null; }}
          aria-label="가로로 이어지는 도트 마을" aria-describedby="classroom-move-help">
          <img className="world-town-image world-town-image--west" src={worldTown} alt="" width={1774} height={887} fetchPriority="high" draggable={false} />
          <img className="world-town-image world-town-image--east" src={worldEast} alt="" width={1774} height={887} draggable={false} />

          <div className="world-objects" aria-hidden="true">
            {destinations.map((place) => <button type="button" tabIndex={-1} key={place.id}
              className={`world-object${nearby?.id === place.id && !walking ? " is-interactive" : ""}`}
              style={{ left: `${worldPercent(place.area.left)}%`, top: `${place.area.top}%`, width: `${worldPercent(place.area.width)}%`, height: `${place.area.height}%` }}
              onPointerDown={(event) => { event.preventDefault(); event.currentTarget.closest<HTMLElement>(".classroom-scene")?.focus({ preventScroll: true }); }}
              onClick={() => enter(place)} title={canInteract && nearby?.id === place.id ? `${place.title} · 클릭해서 상호작용` : `${place.title} 앞으로 걸어가기`}>
              <span className="world-object-hint">{canInteract && nearby?.id === place.id ? "클릭해서 상호작용" : "클릭해서 걸어가기"}</span>
            </button>)}
          </div>

          <nav className="world-landmarks" aria-label="마을의 기능 장소">
            {destinations.map((place) => {
              const interactive = nearby?.id === place.id && !walking;
              return <button type="button" key={place.id} onClick={() => enter(place)}
                className={`world-landmark${interactive ? " is-near" : ""}`}
                style={{ left: `${worldPercent(place.signX ?? place.x)}%`, top: `${place.signY}%`, "--world-sign-y": place.signY } as CSSProperties}
                aria-label={`${place.title} ${interactive ? "상호작용" : "앞으로 이동"} · ${place.description}`}>
                <strong>{place.title}{place.x > 100 && place.id !== "manitto" ? <span className="world-building-status">준비 중</span> : null}</strong><small>{interactive ? "클릭해서 상호작용" : target === place.x ? "앞으로 걸어가는 중…" : "클릭하면 앞으로 걸어가요"}</small>
                {!interactive && <span className="world-landmark-arrow" aria-hidden="true">›</span>}
              </button>;
            })}
          </nav>

          <div ref={avatarRef} className={`world-avatar${walking ? " is-walking" : ""}${facing === "left" ? " faces-left" : ""}`}
            style={{ left: `${worldPercent(position)}%` }} aria-hidden="true">
            <span className="world-avatar-shadow" />
            <img className="world-avatar-image" src={worldAvatar} alt="" width={1333} height={1180} draggable={false} />
            <span className="world-avatar-name">나</span>
          </div>
        </div>
      </div>

      <div className="world-travel-bar">
        <div className="world-arrival" role="status" aria-live="polite">
          <span className="world-arrival-dot" aria-hidden="true" />
          <div><strong>{walking ? destination ? `${destination.title} 앞으로 이동 중이에요` : "마을을 걷고 있어요" : nearby ? `${nearby.title} 앞이에요 · 상호작용할 수 있어요` : "건물이나 물체 가까이 이동해 보세요"}</strong>
            <p id="classroom-move-help">{walking ? "도착한 뒤 건물을 누르거나 E·상호작용 버튼을 눌러요." : "← → / A·D 이동 · 가까이 도착하면 건물 클릭 또는 E·Enter"}</p></div>
        </div>
        <button type="button" className="world-enter" disabled={!canInteract} aria-keyshortcuts="E Enter"
          aria-label={walking ? "이동을 마친 뒤 상호작용" : nearby ? `${nearby.title} 상호작용` : "건물 가까이 이동한 뒤 상호작용"}
          onClick={() => { if (nearby && canInteract) enter(nearby); }}>상호작용</button>
        <div className="classroom-dpad" role="group" aria-label="캐릭터 이동">
          {(["left", "right"] as const).map((direction) => <button type="button" key={direction}
            aria-label={direction === "left" ? "왼쪽으로 이동" : "오른쪽으로 이동"}
            onPointerDown={(event) => beginPointerMove(event, direction)} onPointerUp={movement.stop}
            onPointerCancel={movement.stop} onLostPointerCapture={movement.stop}
            onClick={(event) => stepFromKeyboard(event, direction)}>{direction === "left" ? "←" : "→"}</button>)}
        </div>
      </div>
      <p className="classroom-access-note">길이나 먼 건물을 클릭하면 그곳으로 걸어가요. 방향 버튼은 누르고 있으면 계속 이동해요.</p>
      {onExit && <div className="world-session-actions"><button type="button" className="small outline" onClick={onExit}>활동 마치기</button></div>}
    </section>
  </div>;
}
