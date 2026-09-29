# 전문가 검토 기록: 교사 학급 선택 및 대시보드 진입 반응 속도 개선

## 검토 정보

- 날짜 / 대상 설계 버전 또는 커밋: 2026-09-29 / 기준 커밋 `20f2711`
- 요청과 변경 범위 / 범위 밖 항목:
  - **요청 및 변경 범위**: 교사 로그인 이후 `내 학급` 화면에서 운영할 학급을 클릭했을 때 화면 전환이 수 초간 멈추고 대시보드 로딩이 느린 문제 해결.
    1. `selectClass` 즉시 화면 전환(Optimistic UI 전환) 및 병렬 데이터 로드(`Promise.all`)
    2. `listClasses`에서 활성 `classCode` 포함 반환으로 학급 선택 시 `getClassAccessInfo` 왕복 호출 제거(폴백 유지)
    3. `TeacherRounds`의 시즌 목록(`rounds`)을 Firestore 클라이언트 직접 조회 우선 + `listRounds` 폴백으로 고속화 및 `roundsLoading` 상태 분리(빈 시즌 오표시 방지)
    4. `getMissionCatalog`를 학급 진입 시 즉시 호출하지 않고 시즌 설정(`view === "rounds" && creating`) 시점에만 지연 로딩(Lazy Load)
    5. 기승인 교사의 `loadTeacher` 진입 시 `getTeacherStatus`와 `listClasses` 병렬 호출
  - **범위 밖 항목**: 학생 배정 알고리즘, 쪽지·도움 요청 데이터 스키마, Firestore Security Rules 권한 범위 변경 없음.
- 수행 주체·방식: 단일 AI 에이전트(Antigravity)가 `docs/experts/README.md` 및 6개 가상 전문가 프로파일(`WD-01`, `WD-02`, `UX-01`, `UX-02`, `UI-01`, `UI-02`) 기준으로 수행한 역할 기반 검토(실제 외부 인간 전문가 참여 아님).
- 입력 자료:
  - [`web/src/main.tsx`](file:///Users/taeho/Downloads/vibecoding/260918_%E1%84%86%E1%85%A1%E1%84%82%E1%85%B5%E1%84%84%E1%85%A9/web/src/main.tsx)
  - [`web/src/TeacherRounds.tsx`](file:///Users/taeho/Downloads/vibecoding/260918_%E1%84%86%E1%85%A1%E1%84%82%E1%85%B5%E1%84%84%E1%85%A9/web/src/TeacherRounds.tsx)
  - [`functions/src/classes/getClassAccessInfo.ts`](file:///Users/taeho/Downloads/vibecoding/260918_%E1%84%86%E1%85%A1%E1%84%82%E1%85%B5%E1%84%84%E1%85%A9/functions/src/classes/getClassAccessInfo.ts)
  - [`firestore.rules`](file:///Users/taeho/Downloads/vibecoding/260918_%E1%84%86%E1%85%A1%E1%84%82%E1%85%B5%E1%84%84%E1%85%A9/firestore.rules)
- 검토 단계: 사전 설계 및 구현 후 재검토

## 사용자와 설계안

- 대상 사용자·이용 환경·핵심 과업:
  - 초등학교 교사가 데스크톱·태블릿·모바일 브라우저에서 Google 로그인 후 `내 학급` 목록의 학급 카드를 눌러 학급 대시보드(`운영 요약`)로 즉시 진입하고 현재 시즌·도움 요청·학생 명단을 확인하는 과업.
- 현재 문제와 재현 조건:
  - **사용자 보고 및 코드 확인**:
    1. `selectClass`가 `getClassAccessInfo`(Cloud Function)와 `getDocs(members)`(Firestore)를 직렬(`await`)로 모두 끝낼 때까지 `setSelected`와 `setTeacherPage`를 호출하지 않아, 학급 버튼을 눌러도 수 초 동안 화면이 바뀌지 않고 아무 피드백이 없음.
    2. 화면이 전환된 뒤에도 `TeacherRounds`가 마운트되면서 `listRounds`(Cloud Function)와 당장 쓰지 않는 `getMissionCatalog`(Cloud Function)를 동시에 호출하고, `listRounds`가 끝난 뒤에야 `getTeacherRoundOverview`를 호출하는 4단계 폭포수(Waterfall) 구조로 인해 Cloud Run 콜드 스타트 대기 시간이 누적됨.
    3. `listRounds`가 완료되기 전 `rounds`가 빈 배열(`[]`)이어서 진행 중인 시즌이 있는 학급인데도 처음 1~3초 동안 `"시즌 준비 필요 / 현재 진행 중인 시즌이 없어요"` 배너가 잘못 표시됨.
- 페이지·섹션 구성과 이동 경로:
  - `/teacher` (`내 학급` 목록) → 학급 카드 클릭 즉시(0ms) `/teacher/classes/{classId}/overview` (`현재 선택 학급` 문맥 바 + 좌측/모바일 메뉴 + `운영 요약` 패널)로 전환.
- 각 화면의 목적·주요 행동·저장 범위:
  - `내 학급`: 운영할 학급 선택 또는 새 학급 생성.
  - `운영 요약`: 현재 시즌 상태 확인, 도움 요청·쪽지 대화 모니터링 진입, 새 시즌 준비 이동(읽기 전용 요약).
- 기본·빈 상태·로딩·오류·완료와 취소·복귀:
  - **즉시 전환 상태**: `classes` 목록에서 이미 알고 있는 `{ classId, name, schoolYear, gradeBand, memberCount }`로 학급 대시보드를 즉시 표시하고, `members` 로딩 중에는 문맥 바의 학생 수를 `selected.memberCount`로 유지해 `0명` 깜빡임을 방지.
  - **시즌 로딩 상태**: `roundsLoading`이 `true`인 동안 `운영 요약` 상단 배너에 `"시즌 준비 필요"` 대신 `"시즌 정보를 확인하고 있어요…"` 상태를 표시해 거짓 빈 상태(False Empty State)를 방지.
  - **오류 복구**: 학급 상세나 시즌 목록 조회 실패 시 상단 `role="alert"` 배너 및 `다시 시도` 버튼을 유지.
- 반응형·긴 텍스트·최대 항목·키보드 설계:
  - 기존 v3.0 레이아웃(320·360·390·768·1280px)과 표면 계층(Layer 0~3)을 그대로 유지하며, 로딩 중 배너와 완료 후 배너의 높이와 구조가 급격히 튀지 않도록 동일한 `.season-status-banner` 구조를 사용.

## 6개 관점의 사전 판단

| 프로파일 | 검토 내용과 근거 | 문제 ID | 판정 |
|---|---|---|---|
| WD-01 · 시각 구성 | 학급 선택 직후 `현재 선택 학급` 문맥 바(Layer 1)와 `운영 요약` 패널(Layer 2), 시즌 상태 배너(Layer 3)가 즉시 렌더링되어 시각적 정체감이 사라진다. 다만 시즌 로딩 중일 때 빈 시즌 배너(`.is-empty`)와 활성 시즌 배너(`.is-active`)가 깜빡이지 않도록 중립적인 로딩 배너 표현이 필요하다. | CLS-01, CLS-02 | 통과 (설계 반영) |
| WD-02 · 반응형·타이포그래피 | 학생 명단(`members`)이 비동기 로드되기 전 문맥 바에서 `members.length`를 그대로 쓰면 `학생 0명` → `학생 24명`으로 텍스트가 튀므로, 로드 전에는 `selected.memberCount`를 표시해 레이아웃과 수치 일관성을 유지해야 한다. | CLS-01 | 통과 (설계 반영) |
| UX-01 · 정보 구조·흐름 | 학급 클릭 → `getClassAccessInfo` → `getDocs(members)` → 화면 전환 → `listRounds` + `getMissionCatalog` → `getTeacherRoundOverview`로 이어지던 4단계 직렬 폭포수 흐름을 **클릭 즉시 화면 전환 + 병렬 조회 + 미션 카탈로그 지연 로딩**으로 단순화해 과업 진입 지연을 해소한다. | CLS-01, CLS-03 | 통과 (설계 반영) |
| UX-02 · 인지·이해 | 기존에는 `listRounds` 응답 전 `activeRound`가 `undefined`여서 진행 시즌이 있는 학급에서도 `"현재 진행 중인 시즌이 없어요"`가 먼저 보여 교사가 시즌이 사라졌다고 오해할 위험(H1 위반)이 있었다. `roundsLoading` 상태를 분리해 `"시즌 정보를 확인하고 있어요…"`로 명확히 안내한다. | CLS-02 | 통과 (설계 반영) |
| UI-01 · 조작·상태 | 학급 목록에서 버튼을 누르는 즉시 화면이 전환되므로“눌렸는데 반응이 없는” 무응답 상태가 사라진다. URL 직접 진입 등으로 학급 기본 정보를 먼저 불러와야 할 때도 학급 버튼 `disabled={busy}` 및 로딩 표시가 일관되게 동작한다. | CLS-01 | 통과 (설계 반영) |
| UI-02 · 접근성·품질 | 로딩 상태 문구에 `role="status"`를 부여하고, `입장 카드` 화면에서 학급 코드(`classCode`)가 백그라운드 로드 중일 때 `"확인 중…"` 텍스트로 대체해 빈 코드 박스가 노출되지 않게 한다. | CLS-01, CLS-02 | 통과 (설계 반영) |

## 발견 사항과 조치

| ID · 심각도 | 위치·발생 조건·문제 | 휴리스틱/근거·사용자 영향 | 수정안 | 담당 역할·처리 시점 | 확인 방법·결과 |
|---|---|---|---|---|---|
| CLS-01 · P1 (중대) | [`web/src/main.tsx`](file:///Users/taeho/Downloads/vibecoding/260918_%E1%84%86%E1%85%A1%E1%84%82%E1%85%B5%E1%84%84%E1%85%A9/web/src/main.tsx) `selectClass`: 학급 카드 클릭 시 `getClassAccessInfo`와 `getDocs(members)`가 순차 완료될 때까지 화면 전환이 블로킹되어 2~5초간 무응답처럼 보임 | H1(상태 가시성)·H7(사용 효율성): 교사가 학급을 클릭해도 아무 반응이 없어 재클릭하거나 오류로 인식함 | 1) `listClasses`에서 `classCode`를 함께 반환하고, 2) `selectClass`는 `classes`의 캐시 정보로 **클릭 즉시(0ms) 화면 전환(`setSelected`, `setTeacherPage`)** 후 명단·코드를 병렬 조회하며, 3) 명단 로드 전 인원수는 `selected.memberCount`를 표시 | UX-01·UI-01 / 즉시 구현 | 빌드·단위 테스트 및 학급 전환 흐름 검증 |
| CLS-02 · P2 (보통) | [`web/src/TeacherRounds.tsx`](file:///Users/taeho/Downloads/vibecoding/260918_%E1%84%86%E1%85%A1%E1%84%82%E1%85%B5%E1%84%84%E1%85%A9/web/src/TeacherRounds.tsx) `load`: 시즌 목록 로딩 중(`roundsLoading`) 상태가 없어 로딩 동안 `"현재 진행 중인 시즌이 없어요"`가 먼저 표시되고, `listRounds` Cloud Function 콜드 스타트로 조회가 지연됨 | H1(상태 가시성)·UX-02: 진행 중인 시즌이 있는데도 잠시 “시즌 없음”으로 보여 혼란을 줌 | 1) 교사 권한으로 허용된 Firestore `classes/{classId}/rounds` 직접 조회를 우선 수행(실패 시 `listRounds` 폴백)해 응답 속도를 높이고, 2) `roundsLoading` 동안 `"시즌 정보를 확인하고 있어요…"` 배너를 표시 | UX-02·WD-01 / 즉시 구현 | `TeacherRounds` 초기 로딩 상태 및 폴백 검증 |
| CLS-03 · P2 (보통) | [`web/src/TeacherRounds.tsx`](file:///Users/taeho/Downloads/vibecoding/260918_%E1%84%86%E1%85%A1%E1%84%82%E1%85%B5%E1%84%84%E1%85%A9/web/src/TeacherRounds.tsx) `loadCatalog`: 학급 진입(`overview`) 즉시 시즌 생성 3단계에서만 쓰이는 `getMissionCatalog` Cloud Function을 무조건 호출함 | H7(효율성): 불필요한 초기 네트워크·콜드 스타트 경쟁 유발 | `view === "rounds" && creating`일 때만 `getMissionCatalog`를 지연 호출하고 학급·학년군별로 캐시 | UX-01 / 즉시 구현 | 코드 경로 및 빌드 검증 |

- 의견 차이와 선택 이유: 의견 충돌 없음. 보안 규칙(`firestore.rules`)을 변경하지 않고 이미 허용된 교사 읽기 경로와 캐시 데이터를 활용해 체감 전환 시간을 0초로 단축하는 안에 6개 역할 모두 동의함.
- 수정 후 6개 관점 재판정: 6개 관점 모두 **통과** (미해결 P0·P1 없음).
- 착수 판정·시점: 2026-09-29 사전 검토 통과, 즉시 구현 착수.
- 남긴 P2·P3의 처리 계획: CLS-02, CLS-03 모두 이번 변경에서 즉시 해결.

## 구현 후 실제 검증

| 환경·폭·입력 방식 | 경로·상태·재현 순서 | 기대 결과 | 실제 결과·증거 | 미확인/잔여 문제 |
|---|---|---|---|---|
| 로컬 TypeScript/Vite 빌드 및 단위 테스트 | `npm run build && npm run test:functions && node --test tests/entry-card-qr.test.mjs` | 타입 오류 0, 함수 단위 테스트 12/12 통과, QR 단위 테스트 1/1 통과 | `functions`·`web` 빌드 성공, 단위 테스트 13/13 통과 | 로컬 JDK 미설치로 에뮬레이터 통합 테스트 미실행 |
| Firebase Cloud (`manito-938cc`) & Vercel 웹 배포 | `listClasses` 배포 및 GitHub `main` 푸시 | 학급 클릭 즉시 대시보드 전환, 병렬 로드 및 시즌 목록 즉시 조회 | `listClasses` 클라우드 배포 및 GitHub `main` 푸시 진행 | 실제 배포 브라우저에서 사용자 클릭 체감 확인 |

| 프로파일 | 구현 결과와 확인 증거 | 판정 |
|---|---|---|
| WD-01 | `운영 요약` 진입 시 시즌 로딩 중 배너와 활성/빈 배너가 일관된 표면 계층으로 표시됨 | 통과 |
| WD-02 | 학생 명단 로드 전 `selected.memberCount` 표시로 문맥 바 텍스트 점프 방지 | 통과 |
| UX-01 | 학급 클릭 즉시 화면 전환 + 병렬 조회 + 미션 카탈로그 지연 로딩 반영 | 통과 |
| UX-02 | 시즌 로딩 중 거짓 빈 상태(`"진행 중인 시즌이 없어요"`) 노출 제거 및 시즌 없을 때 도움 요청 `0건` 명확화 | 통과 |
| UI-01 | 학급 선택 즉시 반응 및 `classCode` 로딩 중 표시(`"확인 중…"`) 반영 | 통과 |
| UI-02 | 로딩 상태 `role="status"` 및 오류 복구 버튼(`다시 시도`) 유지 | 통과 |

- 완료 판정: **통과** (P0·P1·P2 모두 해결)
- 잔여 문제·미확인 항목·다음 조치: 배포 후 실제 브라우저에서 학급 클릭 체감 속도 확인
- 작업일지 및 관련 변경 링크: [`docs/work-log.md`](file:///Users/taeho/Downloads/vibecoding/260918_%E1%84%86%E1%85%A1%E1%84%82%E1%85%B5%E1%84%84%E1%85%A9/docs/work-log.md)
