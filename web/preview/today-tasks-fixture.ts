import {
  schooldocCanCancel, schooldocCanReport, schooldocToday, SchooldocMissionsError,
  type SchooldocMission, type SchooldocMissionsClient, type SchooldocMissionView,
} from "../src/schooldocMissionsApi";

function date(offset: number): string {
  const day = new Date(`${schooldocToday()}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + offset);
  return day.toISOString().slice(0, 10);
}
function mission(index: number, title: string, description: string, change: Partial<SchooldocMission> = {}): SchooldocMission {
  return { id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, title, description,
    startDate: date(-2), dueDate: date(2), requiresConfirmation: false, status: "open", check: "unmarked", checkedAt: null, ...change };
}

// This module belongs only to the local preview entry. It never imports config or calls a live API.
export function createTodayTasksPreviewClient(scenario = "default"): SchooldocMissionsClient {
  let state: SchooldocMissionView = { className: "예시 학급 3학년 2반", studentName: "예시 학생", missions: [
    mission(1, "내 자리 정리하기", "책상 위와 주변을 깨끗하게 정리해요."),
    mission(2, "책 10분 읽기", "읽고 싶은 책을 골라 차분히 읽어요.", { requiresConfirmation: true }),
    mission(3, "준비물 챙기기", "수업에 필요한 준비물을 확인해요.", { requiresConfirmation: true, check: "pending", checkedAt: new Date().toISOString() }),
    mission(4, "먼저 밝게 인사하기", "오늘 만난 친구에게 반갑게 인사했어요.", { status: "closed", check: "confirmed", startDate: date(-8), dueDate: date(-4), checkedAt: new Date().toISOString() }),
    mission(5, "학급 물건 제자리에 놓기", "이 미션은 이번에는 해당하지 않아요.", { check: "exempt" }),
  ] };
  if (scenario === "empty") state.missions = [];
  if (scenario === "mismatch") state.studentName = "다른 예시 학생";
  if (scenario === "long") state = { ...state, className: "긴 이름도 차분히 함께 읽는 예시 학급 3학년 2반", missions: Array.from({ length: 60 }, (_, i) => mission(i + 1,
    "친구의 이야기를 끝까지 듣고 함께 사용하는 물건을 제자리에 정리하는 우리 반의 작은 실천을 차근차근 해 보아요. ".repeat(3).slice(0, 100),
    ("친구의 이야기를 끝까지 듣고 차분히 내 생각을 말해 보아요. 함께 쓰는 공간을 정리하며 서로를 배려해요.\n").repeat(20).slice(0, 1000),
    { check: i % 3 === 0 ? "pending" : "unmarked", requiresConfirmation: i % 3 === 0 })) };
  let loseNextSave = scenario === "uncertain";
  let failNextView = scenario === "error";
  async function delay(signal: AbortSignal) {
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new DOMException("취소", "AbortError")); };
      const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 350);
      signal.addEventListener("abort", abort, { once: true });
    });
    signal.throwIfAborted();
  }
  return {
    async view(identity, signal) {
      await delay(signal);
      if (failNextView) { failNextView = false; throw new SchooldocMissionsError("미션을 불러오지 못했어요. 다시 시도해 주세요.", false, 503); }
      if (identity === "오류") throw new SchooldocMissionsError("예시 연결 오류예요. 입력을 유지하고 다시 시도해 주세요.", false, 503);
      return structuredClone(state);
    },
    async mark(_identity, id, status, signal) {
      await delay(signal);
      const selected = state.missions.find((item) => item.id === id);
      if (!selected || !schooldocCanReport(selected) || (status === "unmarked" && !schooldocCanCancel(selected))
        || (status === "reported" && selected.check !== "unmarked")) throw new SchooldocMissionsError("미션을 다시 확인해 주세요.", false, 400);
      state = { ...state, missions: state.missions.map((item) => item.id === id ? { ...item,
        check: status === "unmarked" ? "unmarked" : item.requiresConfirmation ? "pending" : "reported",
        checkedAt: status === "unmarked" ? null : new Date().toISOString() } : item) };
      if (loseNextSave) { loseNextSave = false; throw new SchooldocMissionsError("저장 후 응답이 끊긴 예시예요.", true); }
      return structuredClone(state);
    },
  };
}
