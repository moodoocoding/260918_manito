import { useCallback, useEffect, useRef, useState } from "react";

export type WorldDirection = "left" | "right";
type Motion = { kind: "manual"; direction: WorldDirection } | { kind: "target"; destination: number };
const clampPosition = (value: number, rightEdge: number) => Math.max(5, Math.min(rightEdge, Number.isFinite(value) ? value : 8));

export function useWorldMovement(initialPosition = 8, onPositionChange?: (position: number) => void, rightEdge = 95) {
  const [position, setPosition] = useState(() => clampPosition(initialPosition, rightEdge));
  const [facing, setFacing] = useState<WorldDirection>("right");
  const [walking, setWalking] = useState(false);
  const [target, setTarget] = useState<number | null>(null);
  const positionRef = useRef(position);
  const motionRef = useRef<Motion | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const onChangeRef = useRef(onPositionChange);

  useEffect(() => { onChangeRef.current = onPositionChange; }, [onPositionChange]);

  function updatePosition(value: number) {
    positionRef.current = value;
    setPosition(value);
    onChangeRef.current?.(value);
  }

  const stop = useCallback(() => {
    motionRef.current = null;
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    lastFrameRef.current = null;
    setWalking(false);
    setTarget(null);
  }, []);

  function animate(now: number) {
    const motion = motionRef.current;
    if (!motion) return;
    const elapsed = lastFrameRef.current === null ? 0 : Math.min(50, now - lastFrameRef.current) / 1000;
    lastFrameRef.current = now;
    const current = positionRef.current;
    const direction = motion.kind === "manual" ? (motion.direction === "left" ? -1 : 1) : Math.sign(motion.destination - current);
    const distance = elapsed * 24;
    const next = clampPosition(current + direction * distance, rightEdge);
    if (motion.kind === "target" && Math.abs(motion.destination - current) <= Math.max(distance, .08)) {
      updatePosition(motion.destination);
      stop();
      return;
    }
    if (next !== current) updatePosition(next);
    if ((next === 5 && direction < 0) || (next === rightEdge && direction > 0)) { stop(); return; }
    frameRef.current = window.requestAnimationFrame(animate);
  }

  function start(motion: Motion) {
    motionRef.current = motion;
    lastFrameRef.current = null;
    setWalking(true);
    setTarget(motion.kind === "target" ? motion.destination : null);
    if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(animate);
  }

  function walkTo(destination: number) {
    const next = clampPosition(destination, rightEdge);
    if (Math.abs(next - positionRef.current) < .1) { updatePosition(next); stop(); return; }
    setFacing(next < positionRef.current ? "left" : "right");
    start({ kind: "target", destination: next });
  }

  function beginManual(direction: WorldDirection) {
    if (motionRef.current?.kind === "manual" && motionRef.current.direction === direction) return;
    setFacing(direction);
    updatePosition(clampPosition(positionRef.current + (direction === "left" ? -2.5 : 2.5), rightEdge));
    start({ kind: "manual", direction });
  }

  useEffect(() => {
    const releaseKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const direction = key === "arrowleft" || key === "a" ? "left" : key === "arrowright" || key === "d" ? "right" : null;
      if (motionRef.current?.kind === "manual" && motionRef.current.direction === direction) stop();
    };
    const stopWhenHidden = () => { if (document.hidden) stop(); };
    window.addEventListener("keyup", releaseKey);
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => {
      window.removeEventListener("keyup", releaseKey);
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", stopWhenHidden);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      motionRef.current = null;
    };
  }, [stop]);

  return { position, positionRef, facing, walking, target, walkTo, beginManual, stop,
    step: (direction: WorldDirection) => walkTo(positionRef.current + (direction === "left" ? -4 : 4)),
    isMoving: () => motionRef.current !== null };
}
