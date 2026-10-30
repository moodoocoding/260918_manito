// Kept separate so shared-device lifecycle events can be tested without real student data or browser storage.
export function observeSchooldocPrivacy(clear: () => void,
  doc: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener"> = document,
  page: Pick<Window, "addEventListener" | "removeEventListener"> = window): () => void {
  const hide = () => { if (doc.visibilityState === "hidden") clear(); };
  const leave = () => clear();
  const restore = (event: Event) => { if ((event as PageTransitionEvent).persisted) clear(); };
  doc.addEventListener("visibilitychange", hide);
  page.addEventListener("pagehide", leave);
  page.addEventListener("pageshow", restore);
  return () => {
    doc.removeEventListener("visibilitychange", hide);
    page.removeEventListener("pagehide", leave);
    page.removeEventListener("pageshow", restore);
  };
}
