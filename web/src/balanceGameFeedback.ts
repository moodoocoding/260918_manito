const expectedStateMessages = [
  "진행 중인 회차에서만 자리바꾸기를 할 수 있어요.",
  "회차가 끝났거나 잠시 멈췄어요. 선생님께 확인해 주세요.",
  "짝을 정하려면 참가 학생이 2명 이상이고 짝수여야 해요. 선생님께 학급 명단을 확인해 달라고 해 주세요.",
  "참가 명단을 확인할 수 없어요. 선생님께 학급 명단을 확인해 달라고 해 주세요.",
  "참가 명단이 바뀌어 이 회차의 자리바꾸기를 시작할 수 없어요.",
  "참가 명단이 바뀌었어요. 다시 확인해 주세요.",
  "제출을 받지 않는 상태예요.",
  "모든 학생이 선택을 마친 뒤에 다시 시도할 수 있어요.",
  "짝을 만들고 있어요. 잠시 기다려 주세요.",
  "다시 시도할 수 있는 상태가 아니에요.",
  "짝을 정하려면 학급의 참가 학생이 2명 이상이고 짝수여야 해요. 질문을 살펴보며 선생님의 명단 준비를 기다려 주세요.",
  "학급 명단이 바뀌었어요. 선생님께 새 자리바꾸기 준비를 부탁해 주세요.",
];

export function balanceGameErrorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error ? String(error.code).replace(/^functions\//, "") : "";
}

export function balanceGameErrorText(error: unknown): string {
  const code = balanceGameErrorCode(error);
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  if (code === "failed-precondition") {
    return expectedStateMessages.find((known) => message.includes(known))
      ?? "지금은 자리바꾸기를 시작할 수 없어요. 선생님께 활동 준비 상태를 확인해 달라고 해 주세요.";
  }
  if (code === "permission-denied" || code === "unauthenticated") {
    return "입장 정보를 다시 확인해야 해요. 활동을 마친 뒤 내 카드로 다시 입장해 주세요.";
  }
  if (code === "unavailable" || code === "deadline-exceeded") {
    if (message.includes("짝을 만들지 못했어요. 잠시 후 다시 시도해 주세요.")) {
      return "선택은 저장됐지만 짝을 만들지 못했어요. ‘짝 정하기 다시 시도’를 눌러 주세요.";
    }
    return "서버 연결이 잠시 끊겼어요. 선택한 내용은 이 화면에 남아 있어요. 잠시 후 다시 확인해 주세요.";
  }
  return "정보를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.";
}
