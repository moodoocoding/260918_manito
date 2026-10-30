import { forwardRef, type ButtonHTMLAttributes, type ReactNode, type Ref } from "react";
import "./world-design-system.css";

export type WorldIconName = "clipboard" | "envelope" | "desk" | "book" | "sprout" | "bulletin";
const iconCells: Record<WorldIconName, [number, number]> = {
  clipboard: [0, 0], envelope: [1, 0], desk: [2, 0], book: [0, 1], sprout: [1, 1], bulletin: [2, 1],
};

export function WorldPixelIcon({ name, className = "", size = "medium" }: { name: WorldIconName; className?: string; size?: "small" | "medium" | "large" }) {
  const [column, row] = iconCells[name];
  return <span aria-hidden="true" className={`world-pixel-icon world-pixel-icon--${size} ${className}`}
    style={{ backgroundPosition: `${column * 50}% ${row * 100}%` }} />;
}

export const WorldButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
}>(function WorldButton({ variant = "primary", className = "", type = "button", ...props }, ref) {
  return <button {...props} ref={ref} type={type} className={`world-button world-button--${variant} ${className}`} />;
});

export function WorldPageFrame({ children, className = "", ariaLabel }: {
  children: ReactNode; className?: string; ariaLabel?: string;
}) {
  return <section className={`world-feature-page world-frame ${className}`} aria-label={ariaLabel}>{children}</section>;
}

export function WorldPageHeader({ title, icon = "clipboard", onBack, onExit, disabled = false,
  titleRef, titleId, backLabel = "마을로 돌아가기" }: {
  title: string; icon?: WorldIconName; onBack: () => void; onExit?: () => void; disabled?: boolean;
  titleRef?: Ref<HTMLHeadingElement>; titleId?: string; backLabel?: string;
}) {
  return <header className={`world-page-header${onExit ? "" : " world-page-header--no-exit"}`}>
    <WorldButton variant="secondary" className="world-page-back" onClick={onBack} disabled={disabled}>
      <span aria-hidden="true">←</span>{backLabel}
    </WorldButton>
    <h1 id={titleId} ref={titleRef} className="student-page-title" tabIndex={-1}>
      <WorldPixelIcon name={icon} />{title}
    </h1>
    <div className="world-page-actions">{onExit && <WorldButton variant="secondary" onClick={onExit} disabled={disabled}>활동 마치기</WorldButton>}</div>
  </header>;
}

export function WorldPaper({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`world-paper ${className}`}>{children}</div>;
}

/** Legacy student routes share the same frame while retaining their own data flow. */
export function WorldPageBoundary({ title, icon = "clipboard", intro, onBack, onExit, children }: {
  title?: string; icon?: WorldIconName; intro?: string; onBack: () => void; onExit?: () => void; children: ReactNode;
}) {
  if (!title) return <>{children}</>;
  return <WorldPageFrame ariaLabel={title}>
    <WorldPageHeader title={title} icon={icon} onBack={onBack} onExit={onExit} />
    <WorldPaper>{intro && <p className="world-page-intro">{intro}</p>}{children}</WorldPaper>
  </WorldPageFrame>;
}
