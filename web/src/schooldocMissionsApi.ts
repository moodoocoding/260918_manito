export type SchooldocCheck = "unmarked" | "reported" | "pending" | "confirmed" | "exempt";
export type SchooldocMission = {
  id: string;
  title: string;
  description: string;
  startDate: string;
  dueDate: string;
  requiresConfirmation: boolean;
  status: "open" | "closed";
  check: SchooldocCheck;
  checkedAt: string | null;
};
export type SchooldocMissionView = { className: string; studentName: string; missions: SchooldocMission[] };
export type SchooldocMissionsClient = {
  view: (identity: string, signal: AbortSignal) => Promise<SchooldocMissionView>;
  mark: (identity: string, missionId: string, status: "reported" | "unmarked", signal: AbortSignal) => Promise<SchooldocMissionView>;
};
export type SchooldocMissionsConfig = { endpoint: string; token: string };

export class SchooldocMissionsError extends Error {
  constructor(message: string, readonly uncertain = false, readonly status = 0) {
    super(message);
    this.name = "SchooldocMissionsError";
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const checks = new Set(["unmarked", "reported", "pending", "confirmed", "exempt"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value: string): boolean {
  const time = Date.parse(`${value}T00:00:00Z`);
  return datePattern.test(value) && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
const koreaFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
});

export function schooldocToday(now = new Date()): string { return koreaFormatter.format(now); }

// Presentation follows the existing Schooldoc page; the server always decides whether a write is allowed.
export function schooldocCanReport(mission: SchooldocMission, today = schooldocToday()): boolean {
  return mission.status === "open" && mission.startDate <= today && today <= mission.dueDate;
}
export function schooldocCanCancel(mission: SchooldocMission, today = schooldocToday()): boolean {
  return schooldocCanReport(mission, today) && (mission.check === "reported" || mission.check === "pending");
}
export function schooldocCheckLabel(mission: SchooldocMission, today = schooldocToday()): string {
  if (mission.check === "confirmed") return "선생님 확인 완료";
  if (mission.check === "pending") return "선생님 확인 중";
  if (mission.check === "reported") return "완료 표시";
  if (mission.check === "exempt") return "해당 없음";
  if (mission.status === "closed") return "종료";
  if (today < mission.startDate) return "시작 전";
  if (today > mission.dueDate) return "마감 지남";
  return "해야 할 일";
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown, max: number): value is string { return typeof value === "string" && value.length <= max; }
function badResponse(): never { throw new SchooldocMissionsError("미션 정보를 읽지 못했어요. 새로고침하거나 선생님께 알려 주세요."); }

export function parseSchooldocMissionView(value: unknown): SchooldocMissionView {
  if (!record(value) || !text(value.className, 60) || !text(value.studentName, 60)
    || !Array.isArray(value.missions) || value.missions.length > 60) return badResponse();
  const ids = new Set<string>();
  const missions: SchooldocMission[] = value.missions.map((mission: unknown) => {
    if (!record(mission) || !text(mission.id, 36) || !uuid.test(mission.id) || ids.has(mission.id)
      || !text(mission.title, 100) || !mission.title.trim() || !text(mission.description, 1000)
      || !text(mission.startDate, 10) || !validDate(mission.startDate)
      || !text(mission.dueDate, 10) || !validDate(mission.dueDate) || mission.startDate > mission.dueDate
      || typeof mission.requiresConfirmation !== "boolean" || (mission.status !== "open" && mission.status !== "closed")
      || typeof mission.check !== "string" || !checks.has(mission.check)
      || (mission.checkedAt !== null && (!text(mission.checkedAt, 40) || !Number.isFinite(Date.parse(mission.checkedAt))))) return badResponse();
    ids.add(mission.id);
    // Only the public projection is retained. Never spread an untrusted server response into UI state.
    return { id: mission.id, title: mission.title, description: mission.description,
      startDate: mission.startDate, dueDate: mission.dueDate, requiresConfirmation: mission.requiresConfirmation,
      status: mission.status, check: mission.check as SchooldocCheck, checkedAt: mission.checkedAt as string | null };
  });
  return { className: value.className, studentName: value.studentName, missions };
}

export function createSchooldocMissionsClient(config: SchooldocMissionsConfig, fetcher: typeof fetch = fetch): SchooldocMissionsClient {
  async function request(identity: string, signal: AbortSignal, command?: { missionId: string; status: "reported" | "unmarked" }): Promise<SchooldocMissionView> {
    const input = identity.trim();
    if (!input || input.length > 30) throw new SchooldocMissionsError("본인 이름이나 개인 코드를 확인해 주세요.");
    let endpoint: URL;
    try { endpoint = new URL(config.endpoint); } catch { throw new SchooldocMissionsError("미션 연결을 준비하고 있어요. 선생님께 알려 주세요."); }
    if (endpoint.protocol !== "https:" || !endpoint.hostname.endsWith(".supabase.co") || endpoint.username || endpoint.password
      || endpoint.search || endpoint.hash || endpoint.pathname !== "/functions/v1/class-missions-public" || !uuid.test(config.token)) {
      throw new SchooldocMissionsError("미션 연결 정보를 확인해야 해요. 선생님께 알려 주세요.");
    }
    if (command && (!uuid.test(command.missionId) || !["reported", "unmarked"].includes(command.status))) {
      throw new SchooldocMissionsError("미션을 다시 확인해 주세요.");
    }
    signal.throwIfAborted();
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal.addEventListener("abort", cancel, { once: true });
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 20_000);
    try {
      const response = await fetcher(endpoint.href, {
        method: "POST", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", redirect: "error",
        headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ action: command ? "mark" : "view", token: config.token, studentName: input, code: input, ...command }),
      });
      signal.throwIfAborted();
      let value: unknown;
      try { value = await response.json(); }
      catch { throw new SchooldocMissionsError("미션 응답을 읽지 못했어요. 새로고침해 주세요.", Boolean(command)); }
      if (!response.ok) {
        const safeMessage = record(value) && typeof value.error === "string" && /^[가-힣]/.test(value.error) && value.error.length <= 240
          ? value.error : "미션을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.";
        throw new SchooldocMissionsError(safeMessage, Boolean(command) && response.status >= 500, response.status);
      }
      try { return parseSchooldocMissionView(value); }
      catch { throw new SchooldocMissionsError("미션 정보를 읽지 못했어요. 새로고침해 주세요.", Boolean(command)); }
    } catch (error) {
      if (signal.aborted) throw new DOMException("요청이 취소됐어요.", "AbortError");
      if (error instanceof SchooldocMissionsError) throw error;
      throw new SchooldocMissionsError(timedOut ? "응답이 늦어지고 있어요. 연결을 확인해 주세요." : "연결이 끊겼어요. 잠시 뒤 다시 시도해 주세요.", Boolean(command));
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
    }
  }
  return {
    view: (identity, signal) => request(identity, signal),
    mark: (identity, missionId, status, signal) => request(identity, signal, { missionId, status }),
  };
}
