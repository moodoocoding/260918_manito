# 전문가 검토 기록: 교사·학생 로그인 오류 수정 및 교사 자동 승인 전환

## 검토 정보

- 날짜 / 대상 설계 버전 또는 커밋: 2026-09-29 / `manitto-development-plan.md` v2.3, `design-revision-plan.md` v2.0
- 요청과 변경 범위 / 범위 밖 항목:
  - 변경 범위: 배포 웹(`manito-one-blond.vercel.app`)에서 교사 Google 로그인 시 팝업 차단·지연 및 오류 문구 노출 문제 해결, 팝업 불가 환경을 위한 현재 창(Redirect) 로그인 보조 경로 추가, Google 로그인 교사의 별도 관리자 수동 승인 없는 즉시 승인(`verified`) 전환, `onAuthStateChanged` 오류 메시지 증발 레이스 컨디션 수정, Firebase Auth 오류 문구 한국어화.
  - 범위 밖 항목: 학생 입장 카드 코드 체계 변경, 교사 외 제3자 OAuth 공급자 추가.
- 수행 주체·방식: AI 에이전트(Antigravity)가 `docs/experts/`의 6개 가상 전문가 프로파일(WD-01, WD-02, UX-01, UX-02, UI-01, UI-02) 역할 기준으로 개별 검토 수행 (실제 외부 전문가 참여 아님).
- 입력 자료: `web/src/firebase.ts`, `web/src/main.tsx`, `functions/src/teachers/getTeacherStatus.ts`, `functions/src/shared/authorization.ts`, `firestore.rules`, `docs/experts/README.md` 및 6개 전문가 프로파일.
- 검토 단계: 사전 설계 및 구현 후 재검토

## 사용자와 설계안

- 대상 사용자·이용 환경·핵심 과업:
  - 교사: 데스크톱·태블릿·모바일 브라우저에서 `/teacher`에 접속해 Google 계정으로 로그인하고 즉시 학급을 생성·관리한다.
  - 학생: 공용기기 또는 개인 기기에서 학급 코드와 개인 카드 코드로 `/student`에 로그인하고 활동 후 로그아웃한다.
- 현재 문제와 재현 조건:
  1. **팝업 리졸버 지연 초기화로 인한 팝업 차단(관찰·코드 확인):** 데스크톱 브라우저에서 `@firebase/auth`의 `browserPopupRedirectResolver`가 첫 클릭 시점에야 `apis.google.com/js/api.js`와 `/__/auth/iframe`을 비동기로 로드하여 클릭 제스처 유효 시간이 만료되고 `auth/popup-blocked`가 발생함.
  2. **팝업 차단·인앱 브라우저 대안 부재 및 교사 세션 메모리 초기화(코드 확인):** `inMemoryPersistence`만 고정되어 있고 `signInWithPopup`만 제공되어 팝업 차단 환경이나 모바일 인앱 브라우저에서 로그인이 불가능하며, 교사가 새로고침만 해도 로그아웃됨.
  3. **관리자 수동 승인 대기로 인한 진입 차단(사용자 보고·코드 확인):** Google 로그인에 성공하더라도 운영자가 `scripts/manage-teacher.mjs`를 실행하기 전까지 `pending` 화면(`선생님 확인을 기다리고 있어요`)에 갇힘. 사용자는 Google 로그인 시 별도 수동 승인 없이 바로 학급을 만들고 이용할 수 있도록 변경을 요청함.
  4. **오류 메시지 증발 및 영문 에러 노출(코드 확인):** `onAuthStateChanged` 내 예외 발생 시 `await exit()`(`signOut`)가 비동기 `onAuthStateChanged(null)`을 재호출해 `setError("")`로 오류 메시지를 지워버리며, `errorText()`에 `auth/*` 에러 코드 매핑이 없어 영문 에러 문구가 그대로 출력됨.
- 페이지·섹션 구성과 이동 경로:
  - `/teacher` (비로그인): 영웅 배너 + `선생님 로그인` 카드 (주요 행동: `Google로 로그인`, 보조 행동: `팝업이 안 열리면 현재 창에서 로그인`).
  - `/teacher` (로그인 완료): 수동 승인 대기 화면을 거치지 않고 즉시 `내 학급` 목록 및 `새 학급 만들기` 화면으로 진입(단, 운영자에 의해 명시적으로 `suspended` 처리된 계정은 중지 안내 표시).
- 각 화면의 목적·주요 행동·저장 범위:
  - 교사 로그인 카드: Google 인증 시작. 교사 로그인은 탭 내 새로고침과 리디렉션 복귀를 지원하는 `browserSessionPersistence`를 사용하고, 학생 로그인은 공용기기 보호를 위해 기존 `inMemoryPersistence`를 유지한다.
- 기본·빈 상태·로딩·오류·완료와 취소·복귀:
  - 기본: `Google로 로그인` 주 버튼(채움 스타일)과 `팝업이 안 열리면 현재 창에서 로그인` 보조 버튼(외곽선 스타일) 제공.
  - 로딩: 클릭 시 `로그인 중…` 표시 및 중복 클릭 방지.
  - 오류: 팝업 차단·창 닫힘·도메인 불일치·저장소 제한 등 모든 Firebase Auth 오류를 한국어 회복 안내로 변환하고, `exit()` 시에도 오류 문구가 사라지지 않도록 보존.
- 반응형·긴 텍스트·최대 항목·키보드 설계:
  - 320·360·390·768·1280px에서 로그인 카드 내 주 버튼과 보조 버튼이 최소 44~48px 높이와 12px 간격으로 수직 배치되며 줄바꿈 시 겹침이나 가로 넘침이 없어야 함.

## 6개 관점의 사전 판단

| 프로파일 | 검토 내용과 근거 | 문제 ID | 판정 |
|---|---|---|---|
| WD-01 · 시각 구성 | 선생님 로그인 카드에서 주 행동(`Google로 로그인`)은 기본 코랄 채움 버튼(`.wide`), 보조 행동(`팝업이 안 열리면 현재 창에서 로그인`)은 `.wide.outline`으로 시각 위계를 명확히 구분해 경쟁하지 않게 설계함(H8, H4). | LGN-01 | 통과 |
| WD-02 · 반응형·타이포그래피 | 320px~1280px 전 구간에서 로그인 폼(`.entry-form`) 내부 요소가 단일 열 수직 스택으로 배치되어 보조 버튼과 한국어 오류 문구가 추가되어도 가로 넘침이나 겹침이 발생하지 않음(H8, H4). | LGN-01 | 통과 |
| UX-01 · 정보 구조·흐름 | 교사가 Google 로그인 직후 불필요한 운영자 수동 승인 대기(`pending`) 단계에 막히지 않고 바로 `내 학급` 과업으로 진입하도록 흐름을 단축함. 또한 팝업 차단 시 현재 창 로그인으로 즉시 우회할 수 있는 복구 경로를 제공함(H2, H3, H7). | LGN-01, LGN-02 | 통과 |
| UX-02 · 인지·이해 | 기존 `"운영자의 확인을 기다려 주세요"` 문구가 실제 자동 승인 흐름과 맞지 않아 혼란을 주므로 `"Google 계정으로 로그인하면 바로 학급을 만들고 운영할 수 있어요."`로 수정함. 영문 `Firebase: Error (auth/...)` 대신 구체적인 한국어 해결 안내를 제공함(H2, H9). | LGN-02, LGN-03 | 통과 |
| UI-01 · 조작·상태 | 데스크톱에서도 `browserPopupRedirectResolver._initialize(auth)`를 사전 호출해 첫 클릭 시 지연 없이 팝업이 열리게 하고, `onAuthStateChanged` 실패 시 `exit()`가 오류 배너를 지워버리는 레이스 컨디션을 제거함(H1, H5, H9). | LGN-01, LGN-04 | 통과 |
| UI-02 · 접근성·품질 | 주·보조 로그인 버튼 모두 `<button>` 요소와 최소 44px 이상 터치 영역, 명확한 키보드 초점 표시를 유지하며, 오류 발생 시 `role="alert"` 영역에 한국어 안내가 유지되어 스크린 리더와 키보드 사용자에게 전달됨(H1, H4, H9). | LGN-03, LGN-04 | 통과 |

## 발견 사항과 조치

| ID · 심각도 | 위치·발생 조건·문제 | 휴리스틱/근거·사용자 영향 | 수정안 | 담당 역할·처리 시점 | 확인 방법·결과 |
|---|---|---|---|---|---|
| LGN-01 · P0 | `web/src/firebase.ts` 교사 Google 로그인(`signInWithPopup`) 호출 시 데스크톱 지연 초기화로 팝업이 차단되고 대체 수단(`signInWithRedirect`) 및 세션 유지가 없음 | H1·H3·H9: 교사가 로그인을 완료할 수 없어 서비스 핵심 과업 전체가 차단됨 | `browserPopupRedirectResolver` 사전 초기화, 교사 로그인 시 `browserSessionPersistence` 적용(학생은 `inMemoryPersistence` 유지), `signInWithRedirect` 보조 버튼 및 `getRedirectResult` 처리 추가 | UI-01·UX-01 / 즉시 구현 | `npm run build` 및 코드 검증 완료 |
| LGN-02 · P0 | `functions/src/teachers/getTeacherStatus.ts`, `functions/src/shared/authorization.ts`에서 운영자 수동 승인 전까지 모든 신규 교사 계정을 `pending`으로 차단함 | H2·H7: Google 로그인 후에도 학급 생성·운영을 전혀 시작할 수 없음 | `suspended`가 아닌 교사 Google 로그인 계정은 `getTeacherStatus` 및 `requireVerifiedTeacher`에서 자동으로 `teachers/{uid}`(`verified`) 및 Custom Claims(`role: "teacher", teacherVerified: true`)를 설정하고 클라이언트 토큰을 즉시 갱신함 | UX-01·UX-02 / 즉시 구현 | `manito-938cc`에 `getTeacherStatus`, `listClasses`, `createClass` 배포 완료 |
| LGN-03 · P1 | `web/src/main.tsx`의 `errorText()`에 `auth/*` 오류 코드 매핑이 없어 영문 기술 오류가 노출됨 | H2·H9: 사용자가 오류 원인과 다음 행동(팝업 허용 또는 현재 창 로그인)을 이해하기 어려움 | `auth/popup-blocked`, `auth/popup-closed-by-user`, `auth/unauthorized-domain`, `auth/web-storage-unsupported`, `auth/network-request-failed` 등에 대한 한국어 안내 추가 | UX-02·UI-02 / 즉시 구현 | 코드 반영 및 빌드 확인 완료 |
| LGN-04 · P1 | `web/src/main.tsx`의 `onAuthStateChanged` 예외 처리에서 `await exit()` 호출 시 `signOut` 이벤트가 `setError("")`를 다시 실행해 오류 문구를 지움 | H1·H9: 로그인 직후 서버·권한 오류가 발생해도 아무 메시지 없이 로그인 화면으로 돌아가 원인을 알 수 없음 | 오류 복구용 `exit` 호출 시 `onAuthStateChanged(null)`이 직전 오류 메시지를 지우지 않도록 보존 플래그 적용 | UI-01·UI-02 / 즉시 구현 | 코드 반영 및 빌드 확인 완료 |

- 의견 차이와 선택 이유: 공용기기 보안 원칙상 학생은 `inMemoryPersistence`가 필수이나, 교사까지 `inMemoryPersistence`로 강제하면 `signInWithRedirect`와 새로고침이 불가능해짐. 따라서 기본 및 학생 로그인 전에는 `inMemoryPersistence`를 사용하고, 교사 로그인 시작 시에만 `browserSessionPersistence`를 설정하며 로그아웃(`exit`) 시에는 다시 `inMemoryPersistence`로 초기화해 학생 공용기기 보안과 교사 로그인 안정성을 모두 충족하도록 결정함.
- 수정 후 6개 관점 재판정: WD-01, WD-02, UX-01, UX-02, UI-01, UI-02 모두 `통과`.
- 착수 판정·시점: 2026-09-29 사전 검토 통과, 미해결 P0·P1 없음 — 구현 완료.
- 남긴 P2·P3의 처리 계획: 없음.

## 구현 후 실제 검증

| 환경·폭·입력 방식 | 경로·상태·재현 순서 | 기대 결과 | 실제 결과·증거 | 미확인/잔여 문제 |
|---|---|---|---|---|
| 로컬 빌드·단위 테스트 (`Node.js v24.14.1`) | `npm run build`, `npm run test:functions`, `node --test tests/entry-card-qr.test.mjs` | TypeScript·Vite 빌드 성공 및 단위 테스트 전체 통과 | 함수·웹 빌드 성공, 함수 단위 테스트 12건·QR 테스트 1건 통과 | 로컬 Java 런타임 미설치로 Firestore 에뮬레이터 기반 통합 테스트는 이번 세션에서 미실행 |
| Firebase 클라우드 (`manito-938cc`) | `getTeacherStatus`, `listClasses`, `createClass` 업데이트 배포 및 Identity Toolkit 설정 확인 | 서울 리전(`asia-northeast3`) 배포 성공 및 `manito-one-blond.vercel.app` 허용 도메인·Google OAuth 엔드포인트 정상 응답 | 3개 함수 모두 `Successful update operation` 및 `Deploy complete!` 확인 | 배포 웹에서 사용자의 실제 Google 계정 로그인 수동 확인 필요 |

| 프로파일 | 구현 결과와 확인 증거 | 판정 |
|---|---|---|
| WD-01 | 선생님 로그인 카드(`.entry-form`)에 주 행동 `.wide`(`Google로 로그인`)와 보조 행동 `.wide.outline`(`팝업이 안 열리면 현재 창에서 로그인`)이 기존 디자인 시스템 토큰으로 정돈되게 배치됨. | 통과 |
| WD-02 | 기존 `.entry-form`의 수직 플렉스/그리드 스택 안에 버튼이 배치되어 320~1280px 전 폭에서 고정 폭 넘침을 유발하지 않음. | 통과 |
| UX-01 | 팝업 로그인 실패 시 현재 창 리디렉션 로그인으로 즉시 전환할 수 있고, 로그인 성공 시 운영자 수동 승인 대기 없이 바로 `내 학급` 화면으로 진입함. | 통과 |
| UX-02 | 로그인 카드 안내 문구가 실제 즉시 이용 가능 정책과 일치하며, 팝업 차단·창 닫힘·도메인 오류·쿠키 차단 시 한국어 해결 방법이 표시됨. | 통과 |
| UI-01 | `browserPopupRedirectResolver` 사전 초기화, `preserveErrorOnSignOut` 플래그를 통한 오류 배너 보존, 신규 교사 클레임 부여 직후 `getIdToken(true)` 갱신이 연결됨. | 통과 |
| UI-02 | 기본 `<button>` 요소와 `role="alert"` 오류 배너를 유지하여 키보드·스크린 리더 접근성을 보존함. | 통과 |

- 완료 판정: 코드 구현 및 백엔드 클라우드 배포 완료 (실제 사용자 브라우저 Google 로그인 최종 확인 대기).
- 잔여 문제·미확인 항목·다음 조치: 로컬에 Java 런타임이 없어 Firestore 에뮬레이터 테스트는 실행하지 못했으며, 배포된 Vercel 웹에서 실제 브라우저의 Google 로그인과 VoiceOver·200% 확대 수동 확인은 미확인 항목으로 구분함.
- 작업일지 및 관련 변경 링크: [work-log.md](../work-log.md), [firebase.ts](../../web/src/firebase.ts), [main.tsx](../../web/src/main.tsx), [authorization.ts](../../functions/src/shared/authorization.ts), [getTeacherStatus.ts](../../functions/src/teachers/getTeacherStatus.ts)
