# 전문가 검토 기록: 도트 교실 오늘 할 일

## 검토 정보

- 날짜·설계: 2026-10-30, 사용자가 확인한 이미지 시안 이후의 실제 화면 구현.
- 범위: Schooldoc 공개 미션 API를 재사용하는 학생 내부 페이지, 월드 진입·복귀, 입력·완료·취소·새로고침, 로컬 가상 미리보기. Schooldoc·Firebase 함수·Rules·실학생 데이터·배포 변경은 범위 밖.
- 수행 주체: Codex 한 에이전트의 6개 가상 프로파일별 검토. 외부 전문가·교사·학생 참여 없음.
- 자료: `docs/today-tasks-integration-plan.md`, 승인된 이미지 시안, `StudentClassroom.tsx`, `main.tsx`, `preview/world.tsx`, Schooldoc `main` d12665f의 공개 페이지·API·공통 타입·서버 handler·config.
- 실제 연결 근거: 공개 웹 번들에서 공개 Supabase origin만 추출(비밀 파일·키 미열람). 2026-10-30 공개 함수 OPTIONS 200, CORS `*`, `content-type` 허용, `no-store`; 학생/토큰 없는 `{action:"view"}` POST는 JWT 없이 400 안전 오류. 학생 조회·DB 변경 요청 없음. 공개 endpoint는 `https://jhystopaacyfvjxhnpyd.supabase.co/functions/v1/class-missions-public`.
- 계획서의 UI-02 연결 근거 부족 항목은 위 증거로 재검토한다. 실제 유효한 학생 조회·저장 동등성은 가상 transport와 계약 테스트로 확인하고 운영 저장은 미확인으로 구분한다.

## 사용자와 설계안

- 과업: 마을 학교에 들어가기 → 기존 Schooldoc 이름/코드로 본인 미션 접속 → 읽기·완료/취소 → 같은 위치의 마을로 돌아가기.
- 현재 문제: 외부 URL 같은 탭 이동으로 명시적 복귀 수단과 월드 위치 메모리가 끊긴다(사용자 보고 및 `window.location.assign` 코드 근거).
- 페이지: `/student/today-tasks`; 헤더(복귀·제목·활동 마치기) → 학생 접속 또는 본인 문맥 → 요약 → 지금 할 일 → 완료 표시 → 시작 전·지난 미션/해당 없음. 일반 학생 네비·topbar의 중복 제목은 이 페이지에서 생략하고 자체 도움·종료 경로를 제공한다.
- 시각: 사용자 시안의 도트 교실 배경과 나무 프레임·종이 표면. 배경 그림에는 텍스트·버튼을 넣지 않고 실제 HTML 제목·입력·조작으로 그린다. 실행은 초록색, 복귀/새로고침/취소는 밝은 테두리, 상태는 작은 배지로 구별한다.
- 반응형: 1280px에서 최대 1120px 내용·미션 최대 2열, 768px 이하는 1열. 390·360·320px에서는 헤더 줄바꿈과 종이 패딩 축소, 접속 입력·주 행동을 장식 아래로 과도하게 밀지 않음. 100자 제목·1000자 안내·60개 항목은 자연 줄바꿈/세로 스크롤, 지난 기록 접기.
- API: 정확히 기존 `view`/`mark` body와 `reported|unmarked`; `pending` 결정은 서버. 키·Firebase 토큰·교사 세션을 외부에 보내지 않음. 공개 함수 주소/공유 token만 공개 config로 지정.
- 주요 상태: 접속 전·조회 중·할 일 없음·완료 표시·확인 대기·교사 확인·해당 없음·시작 전/종료·요청 제한·잘못된 응답·전송 결과 불확실. 불확실한 제출 뒤에는 새로고침 전 추가 제출을 막음. 성공 안내는 서버 응답 뒤에만 표시.
- 공용기기: 이름/코드/응답은 컴포넌트 메모리만 사용. 숨김·BFCache 복귀·언마운트에서 폐기하고 abort/generation으로 이전 결과 적용 차단. 실제 요청마다 기존 `getStudentHome`으로 마니또 세션을 확인. 종료는 기존 `exit()`, 마을 좌표는 기존 App ref에만 보존. 새 화면 재진입은 Schooldoc 재접속.
- 조작: native label/form/button/details, 48px 주요 목표, 가시적 초점, 역할별 오류/status, 이동 후 제목 또는 입력 초점. 전송 중에도 복귀·종료 가능. 프리뷰는 별도 가상 client를 주입하며 운영 API 호출 없음.

## 6개 관점의 사전 판단

| 프로파일 | 개별 판단·근거 | 문제 | 판정 |
|---|---|---|---|
| WD-01 시각 구성 | 이미지의 교실 장식을 외곽 배경으로만 사용하고 나무 탐색·종이 요약·진한 테두리 과업 카드를 분리한다. 현재 할 일과 초록 실행 버튼이 주 초점이다. | TT-01 | 통과 |
| WD-02 반응형 | 내용 길이에 맞춘 카드 높이, 1/2열 기준, 320px·확대에서 단일 세로 흐름을 명시했다. 라벨/입력/오류는 같은 카드 안에 둔다. | TT-02 | 통과 |
| UX-01 정보 구조 | 학교 진입이 내부 라우트가 되고 모든 상태의 명시적 복귀가 기존 위치 ref를 사용한다. 이름/코드 재접속과 마니또 로그아웃의 범위를 안내한다. | TT-03 | 통과 |
| UX-02 이해 | “완료 표시”와 “선생님 확인”을 구별하고 이름 자동 매칭을 하지 않는다. 빈 목록·실패를 학생 탓으로 표현하지 않으며 도움을 제공한다. | TT-04 | 통과 |
| UI-01 조작·상태 | 중복 lock, abort, 불확실 결과 후 조회, 서버가 결정하는 상태를 설계했다. reported/pending만 취소하고 confirmed/exempt는 수정 요청을 안내한다. | TT-05 | 통과 |
| UI-02 접근성·품질 | 실제 공개 함수의 무자격 preflight/검증 오류로 origin/JWT 근거를 보완했다. iframe 없이 native UI로 초점·역할을 제어하며 실제 브라우저 검증 계획을 분리한다. | TT-06 | 통과 |

## 발견 사항·조치

| ID·등급 | 문제 → 근거 → 사용자 영향 | 수정안 | 담당·시점 | 확인 방법 |
|---|---|---|---|---|
| TT-01 P1 설계 해결 | UI를 포함한 시안 이미지를 배경으로 쓰면 문구·버튼이 중복됨 → H4/H8 → 조작 대상을 오해 | 글자 없는 배경 제작, 모든 UI는 HTML | WD-01·구현 전 | 전체 렌더/Tab 확인 |
| TT-02 P1 설계 해결 | 2열 고정은 긴 문구/모바일 잘림 → H6/H8 → 과업 이해 차단 | 768 이하 1열, 모든 문자열 wrap, 고정 높이 없음 | WD-02·구현 | 폭별 긴 가상 콘텐츠·200% 확인 |
| TT-03 P1 설계 해결 | 뒤로가기에 의존 → H3 → 마을 복귀 어려움 | 명시적 내부 복귀·좌표 ref 재사용 | UX-01·구현 | 학교 이동·복귀·history/새로고침 경로 |
| TT-04 P2 설계 반영 | 저장 표시와 교사 확인을 혼동 → H1/H2 → 제출 결과 오해 | 상태별 문구와 설명, 교사 확인 전용 배지 | UX-02·완료 전 | reported/pending/confirmed 비교 |
| TT-05 P1 설계 해결 | 응답 유실 때 무조건 재전송 → H5/H9 → 저장 상태 오해/중복 | 요청 잠금·불확실 배너·재조회 후 제출 | UI-01·완료 전 | 지연/타임아웃/응답 유실 client 테스트 |
| TT-06 P0 설계 해결 | 숨겨진 이전 학생 응답·자격이 복귀 때 남음 → 공용기기 정책 → 개인정보 노출 | 메모리 한정·숨김/BFCache/이탈 폐기·세션 재검증 | UI-02·완료 전 | 숨김/복귀·이전 요청 늦은 완료 검증 |

- 착수 판정: 6개 관점 모두 통과. P0/P1은 위 설계로 해소했고 구현 후 재확인한다. P2는 UX-02가 상태 문구와 가상 데이터로 완료 전에 확인한다.
- 충돌 조정: 시안과 동일한 2열을 모든 폭에 유지하는 대신 작은 폭의 가독성을 위해 1열로 변경. Schooldoc의 이름/코드 계약을 유지하되 Firebase 학생 세션과 자동으로 결합하지 않는다.
- 구현 중 사전 설계 보완: 긴 목록에서 도움을 처음부터 찾을 수 있도록 헤더의 종료 버튼 옆에 ‘도움’을 둔다. WD-01은 보조 테두리 스타일로 초록 제출과 구별, WD-02는 320px 줄바꿈/버튼48px 유지, UX-01은 기존 도움 경로 재사용, UX-02는 접근 가능한 이름을 ‘선생님 도움’으로 명시, UI-01은 전송 중 이동 가능, UI-02는 Tab 경로/초점 확인을 조건으로 각각 통과했다. 기존 도움 API·저장 범위는 바꾸지 않는다.

## 구현 후 실제 검증

| 환경 | 경로·상태 | 실제 결과·증거 | 한계 |
|---|---|---|---|
| IAB 1280px | 가상 학생 접속·2열 목록 | [화면](assets/today-tasks-1280.png), 실제 페이지1120px/미션517px×2, 문서폭1280px | 실제 운영 데이터 아님 |
| IAB 768/390/360/320px | 접속·1열 미션·복귀 | [768](assets/today-tasks-768.png)·[390](assets/today-tasks-390.png)·[360](assets/today-tasks-360.png)·[320](assets/today-tasks-320.png). 각 문서폭=뷰포트, 카드676/336/306/266px(390은 캡처 기준), 복귀 버튼48px 이상, 모바일 첫 과업/완료 버튼 표시 | 실기기 터치 미실시 |
| IAB 390px 최대 데이터 | 60개, 제목100자·본문1000자 | [긴 내용](assets/today-tasks-long-390.png), 카드60개, 제목/설명 가로 잘림0, 자연 줄바꿈 | 긴 최대 본문은 자연스러운 세로 스크롤 허용 |
| IAB 390px 글자200% | preview root font16→32px | [확대](assets/today-tasks-text-200-390.png), 문서폭390px, 제목/설명/버튼 가로 잘림0 | 브라우저 자체 zoom과 구분 |
| IAB 기본·390px | 완료·취소·교사 확인·빈 목록 | reported로 이동/취소, 확인 필요 미션은 pending, 빈 목록은 [대체 안내](assets/today-tasks-empty-390.png). 서버 계약을 모사한 가상 client 사용 | 실제 Schooldoc 저장 미실행 |
| IAB 390px 오류·응답 유실 | 이름 “오류” 조회 실패 후 코드/Enter 재접속. 가상 저장 성공 후 응답만 유실 | [오류](assets/today-tasks-error-390.png)·[불확실 저장](assets/today-tasks-uncertain-390.png), 오류 초점/기존 입력 유지, 완료·취소 비활성, 새로고침 뒤 저장 상태 반영/초점복원 | 실제 운영 장애 재현 아님 |
| IAB 키보드·라우트 | Tab/Enter·학교앞 E·명시적 복귀·back/forward·조회 중 이탈 | 제목/오류/옮겨진 카드/새로고침 초점 확인, 월드 left8%=월드좌표16 복원, 재진입시 이전 본인 미션 없음. 콘솔 error/warn0 | 화면 읽기 프로그램 미실시 |
| 자동 계약/수명주기 | `npm run test:today-tasks` | 9/9 통과. view/mark body·상태·Korea날짜·잘못된 응답·endpoint 제한·외부 abort·타임아웃·hidden/pagehide/BFCache cleanup 검사 | 실제 브라우저 탭 visibility 변경은 IAB에서 재현되지 않음 |
| 빌드 | 웹 build·preview 별도 tsc | TypeScript/Vite 성공, 기존 큰 JS chunk 경고 유지 | Firebase 함수/Rules 미변경, 관련 서버 검사는 이번 범위에서 미실행 |

### 사후 개별 재판정

| 프로파일 | 확인 근거·판단 | 판정 |
|---|---|---|
| WD-01 | 전체 데스크톱/모바일 캡처에서 나무 헤더·종이 요약·진한 미션 경계·초록 주 실행을 구별한다. 배경에는 글자/조작을 넣지 않았다. | 확인한 범위 통과 |
| WD-02 | 320~1280px과 100/1000자·60개 fixture, 글자32px에서 겹침/가로 잘림 없이 재배치. 좁은 화면은1열이고 라벨·오류는 폼과 연결된다. | 확인한 범위 통과 |
| UX-01 | 학교 E 진입/명시적 마을 복귀/back·forward/조회 중 이탈에서 위치16을 유지하고 이전 미션 화면을 자동 복원하지 않았다. | 확인한 범위 통과 |
| UX-02 | 저장 표시와 교사 확인을 다른 상태로 보여 주고 빈 목록/오류를 설명한다. 이름 오류 후 개인 코드로 복구했으며 학생 이름 자동 결합을 하지 않는다. | 확인한 범위 통과, 실제 학생 이해도 미확인 |
| UI-01 | 가상 완료·취소·pending·불확실 저장 후 재조회와 전송중 이탈 확인. 초점이 사라지던 새로고침은 종료 후 버튼으로 돌아오도록 보완하고 재확인했다. | 확인한 범위 통과 |
| UI-02 | 실제 native label·button·details·alert/status와 초점, 48px 버튼, 글자 확대를 브라우저에서 확인했다. 수명주기 테스트9개가 전송중 abort와 기억 제거를 보호한다. | 확인한 범위 통과, 보조기기/실세션·실탭 숨김 미확인 |

- 범위 내 미해결 P0/P1/P2: 없음. 운영 데이터 저장 동일성은 아직 확인되지 않았으므로 운영 연동 검증 완료로 보고하지 않는다.
- React 품질 검토: 파생 목록은 state에 중복 보관하지 않음, 연결 자격은 메모리 ref만 사용, 구독·timer·요청 취소 정리, 오래된 요청 generation 검사, preview client는 별도 entry에만 주입. 신규 의존성 없음.
- 남은 검증: 가상 운영 학급으로 기존 Schooldoc 화면과 동일 결과 대조, 실제 Firebase 세션/카드 차단, 실기기 터치·화면 읽기 프로그램·실제 학생 사용성. 배포 없음.

## 배경 에셋·생성 프롬프트

- 도구: built-in `image_gen` 편집. 승인된 시안의 UI를 제거해 배경만 생성했다.
- 프로젝트 에셋: `web/src/assets/today-tasks-classroom-v1.png`(1536×1024, 2,134,954 bytes). 원본을 보존하고 복사했다.
- 입력 시안: `/Users/taeho/.codex/generated_images/01a18a9f-5c92-77e2-af4e-9eb6d237c126/exec-f5814d61-9f7c-408d-aedb-80fdd736b0a1.png`
- 출력 원본: `/Users/taeho/.codex/generated_images/01a18a9f-5c92-77e2-af4e-9eb6d237c126/exec-87048bcb-7e28-4299-b16d-e818e13d1d50.png`
- 최종 사용 프롬프트:

> Edit this approved pixel classroom UI mockup into a decorative BACKGROUND IMAGE ONLY for a real web interface. Keep the exact beautiful warm 16-bit pixel art classroom atmosphere: large sunny windows on the left with blue sky and terracotta-roof school outside, oak desks, books, white flowers, greenery, wood floor, bookshelf and chalkboard on the right. REMOVE THE ENTIRE FOREGROUND WEB INTERFACE: remove the giant central board, wood header with title and buttons, all parchment panels, all UI cards, all words, all numbers, all icons, all controls, footer signage. Reveal the natural classroom behind the removed board with a quiet pale warm cream plaster classroom wall in the middle and wooden floor below. The center 70% must be simple very quiet empty light cream wall to later overlay actual HTML controls, with no rectangle resembling a UI card. Keep highly detailed pixel classroom scenery primarily in left and right outer 15% margins and top edge. Chalkboard on far right must be empty with absolutely no writing. No text, no typography, no letters, no watermark, no UI, no interface anywhere. A richly colored sharply pixelated environment, same perspective, 1536x1024 landscape.
