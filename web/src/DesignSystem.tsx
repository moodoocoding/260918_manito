import { useEffect, useRef, type ReactNode } from "react";
import { WorldButton } from "./WorldPage";

export function ConfirmDialog({ title, detail, confirmLabel, onConfirm, onCancel, busy = false }: {
  title: string; detail: string; confirmLabel: string; onConfirm: () => void;
  onCancel: () => void; busy?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal();
    cancel.current?.focus();
    return () => {
      element.close();
      returnFocus.current?.focus();
    };
  }, []);
  return <dialog ref={dialog} className="confirm-dialog" aria-labelledby="confirm-title" aria-describedby="confirm-detail"
    onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id="confirm-title">{title}</h2><p id="confirm-detail">{detail}</p>
    <div className="action-row"><WorldButton ref={cancel} variant="secondary" disabled={busy} onClick={onCancel}>돌아가기</WorldButton>
      <WorldButton variant="danger" disabled={busy} onClick={onConfirm}>{busy ? "처리 중…" : confirmLabel}</WorldButton></div>
  </dialog>;
}

export function CheckboxRow({ checked, disabled = false, children, onChange }: {
  checked: boolean; disabled?: boolean; children: ReactNode; onChange: (checked: boolean) => void;
}) {
  return <label className={`choice-row${checked ? " is-selected" : ""}${disabled ? " is-disabled" : ""}`}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    <span>{children}</span>
  </label>;
}
