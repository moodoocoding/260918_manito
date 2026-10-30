# 우리 반으로, 같이 떠나요

대한민국 초등학교 교사와 학생을 위한 통합 학급 공간이다. 기존 마니또의 학급·학생·코드·카드·기록을 같은 DB에서 계승하며, 마니또·오늘 할 일·비밀 우체통·게시판/자리바꾸기를 학급 아래의 별도 서비스로 제공한다. 마니또 시즌은 해당 서비스 내부 상태이며 메인 마을이나 다른 서비스의 이용 조건이 아니다. [상위 구조와 데이터 계승 원칙](docs/class-platform-architecture.md)을 따른다. 실제 학생 데이터 도입 전 개인정보 처리 근거와 학교·보호자 안내, 보존·권리 요청 절차를 확정해야 한다.

## 현재 상태 (2026-10-30)

- 마니또는 새 공간1에서 진입하는 독립 학생 서비스로 연결했다. 공통 도트 교실 안에서 미션·친구 쪽지·도움·지난 활동을 나누고, 미션 쉬기와 완료/골라볼/쉬었어요 요약, 쪽지 입력 라벨, 저장 중 이동 안내와 세션 종료 보호를 보강했다. 기존 API를 사용하며 로컬 가상4명으로 제출·공개·본인 관계 가림·회고 저장/복원·로그아웃을 확인했다. 실제 화면320~1280px를 검증했고 최종200%·스크린리더·강제 지연 경쟁·native confirm 초안 왕복은 미확인이다. [리뉴얼 검증](docs/design-reviews/2026-10-30-manitto-student-world-refactor.md), [공개·회고 화면 보완](docs/design-reviews/2026-10-30-manitto-reveal-reflection-polish.md)을 참고한다. GitHub·웹 배포 상태는 작업일지와 별도 배포 결과를 따른다.

- 선생님 방은 사용자가 지정한 목재 통합 운영 허브에서 학급 개설·명부·코드·입장 카드를 공통 관리하고, 마니또·비밀 우체통·오늘 할 일·게시판의 운영 또는 연결 상태로 이동한다. 초기 로그인 때 기존 학급이 하나면 같은 학급의 서비스 모음으로 바로 진입한다. 우체통 새5함수는 클라우드 미배포라 웹에서는 준비 안내로 보류하고 실제 접수·조회 호출을 막는다. 오늘 할 일·게시판의 교사용 설정도 상태 화면에 미연결로 안내한다. [허브 검토와 검증 범위](docs/design-reviews/2026-10-30-teacher-workspace-scope-correction.md)를 참고한다.

- 기존 마니또 DB/카드로 로컬 로그인할 때는 공개 Firebase 웹 앱 설정을 git 제외 `web/.env.cloud.local`에 두고 `npm run dev:web:cloud -- --host 127.0.0.1 --port 5175 --strictPort`로 실행한다. cloud 모드는 기존 `manito-938cc`/Emulator 미사용을 검사한다. `demo-manitto` 에뮬레이터의 가상 카드와 기존 클라우드 카드는 서로 호환되지 않는다. DB·학생·카드를 새로 만들거나 재발급할 필요는 없다.

- 로컬 작업본의 ‘오늘 할 일’은 도트 교실 내부 화면에서 Schooldoc의 기존 공유 미션 API로 본인 조회·완료·취소를 요청한다. 현재 한 학급·동명이인 없음 조건에서, 매 요청 검증된 로그인 이름으로 자동 연결하고 이름/코드를 다시 입력받지 않는다. 2026-10-30 지정 학생의 기존 카드 로그인→추가 입력 없는 실제 미션 조회→완료/취소 저장·재조회와 원본 Schooldoc 결과 일치를 확인했다. 최종 미션 상태는 복원했으며 기존 DB/카드/Schooldoc 서버를 변경하지 않았다. 로컬 서버의 잘못된 Emulator 연결을 기존 클라우드로 수정한 결과이며 배포 완료를 뜻하지 않는다. [실연동 검증](docs/design-reviews/2026-10-30-today-tasks-live-verification.md), [자동 연결 검토](docs/design-reviews/2026-10-30-today-tasks-auto-connect.md), [시안 보정 검토](docs/design-reviews/2026-10-30-today-tasks-common-design.md)를 따른다.

- 로컬 작업본은 도트 로그인과 지도 뷰포트 두 배 길이의 마을을 제공한다. 비밀 우체통은 담당 교사에게 보내는 일반 편지와 9단계 사건 신고로 구분하며 교사에게 별도 ‘학생 편지·신고’ 수신함을 제공한다. 마니또 친구 간 쪽지는 별도 경로로 유지한다. 신규 우체통 API·비공개 데이터 경로와 미처리 신고의 공개 차단은 로컬 구현 범위이며 클라우드 배포 완료를 뜻하지 않는다. [검토·검증 범위](docs/design-reviews/2026-10-30-teacher-mailbox.md)와 [작업일지](docs/work-log.md)를 따른다.

- D1 학급·학생 카드·로그인·로그아웃은 Firebase 개발 프로젝트 `manito-938cc`와 [Vercel 개발 웹](https://manito-one-blond.vercel.app)에 배포됐다.
- D2~D5 시즌·서버 매칭·학년군별 기본 미션 40개와 교사 미션 추가·1:1 익명 쪽지와 답장·교사 모니터링·도움 요청·공개·회고·설정 복사·학급 삭제 기능을 구현했다. `demo-manitto` 에뮬레이터로 가상 학급 두 시즌과 40명 매칭을 검증했다. Firebase 개발 백엔드와 Vercel 웹의 최신 배포 결과는 [작업일지](docs/work-log.md)를 본다.
- 자리바꾸기 신규3함수와 새 경로 Rules는 2026-10-30 개발 `manito-938cc`에 선택 배포했다. 이후 마니또 회차 기간에 묶여 질문이 보이지 않던 문제를 학급 독립 활동으로 수정·선택 업데이트했다. 기존59개 함수의 배포 전후 수정 시각/리비전/설정은 동일하다. Secret 연결과 비인증403을 확인했으며 실제 학생의 AI 짝 생성과 웹 배포는 별도다. Supabase 기존 함수/DB는 변경하지 않았다. [최초 배포 기록](docs/design-reviews/2026-10-30-balance-game-deployment.md), [학급 독립 수정·검증 기록](docs/design-reviews/2026-10-30-balance-game-missing-questions.md)을 참고한다.
- Firebase Google 로그인 제공업체와 Vercel 허용 도메인을 설정했다. Google로 로그인한 교사는 별도 관리자 수동 승인 대기 없이 자동으로 확인(`verified`) 및 권한 클레임이 설정되어 바로 학급을 만들고 운영할 수 있다(이용 중지 `suspended` 계정은 차단 유지). 데스크톱 팝업 리졸버 사전 초기화와 현재 창(Redirect) 로그인 보조 버튼을 함께 제공한다. 개발 클라우드의 Custom Token 서명 권한을 복구했고 배포 웹에서 가상 학생 로그인, 미션·도움·공개·감사·회고, 설정을 복사한 두 번째 회차의 공개·보관까지 확인했다. 학생 정보 요청은 접수 단계이며 개별 정정·삭제 처리 절차와 실제 학생 운영용 별도 프로젝트도 아직 없다.
- App Check와 reCAPTCHA는 사용자 결정에 따라 사용하지 않는다. 인증, 카드 실패 잠금, 세션 버전, 함수 권한 검사, Firestore Rules와 요청 멱등성을 유지한다.
- 사용자의 요청에 따라 화면의 공통 개발 검증 안내는 제거했다. 실제 학생 데이터 사용 전 개인정보 처리방침과 학교·보호자 안내 절차를 확정해야 한다. [개인정보 처리방침 초안](docs/privacy-policy-draft.md)은 운영 주체·연락처·보유 기간 등이 미확정인 검토 문서다.
- [디자인 수정 계획서](docs/design-revision-plan.md)의 교사·학생 업무별 페이지, 선택 행과 대비, 안전 원문 가림을 코드에 적용했다. 현재 시즌 준비는 5단계다. 가상 학급의 인증 후 교사 320·360·390·768px, 학생 320px 화면과 A4 카드 1·40장 출력 데이터를 검증했고 빌드·함수·Rules·통합 테스트를 통과했다. [구현 후 검토](docs/design-reviews/2026-09-28-season-missions-messages-cards.md)에 200% 확대·VoiceOver·물리 인쇄·사용자 관찰 등 미완료 검수를 구분했다. 디자인 전체 완료 판정은 아직 아니다.
- 교사 메뉴에서 `시즌 설정`을 운영 요약 다음에 두고 시작·종료일과 5/10/15/20일 빠른 선택을 제공한다. `배정 확인`에서 담당 교사가 시작 시 확정된 일대일 관계를 감사 기록과 함께 명시적으로 열람한다. `입장 카드`에서 전체·선택 출력, 이름별 차단/해제와 재발급 후 즉시 출력을 제공한다. 인쇄 카드의 공통 QR은 학생 입장 화면만 열며 개인 코드는 카드에서 직접 입력한다. 신규 카드는 서버 전용 암호문으로 재출력하고, 이전 카드는 확인 후 재발급한다. [카드·시즌 검토](docs/design-reviews/2026-09-27-cards-and-seasons.md), [QR 검토](docs/design-reviews/2026-09-28-entry-card-qr.md), [배정 확인 검토](docs/design-reviews/2026-09-28-teacher-assignments.md)에 검증 범위를 기록했다.
- 시즌 준비를 기본 정보·참가자·미션·쪽지·확인/저장 5단계로 나누고, 수업일 개별 입력은 기본 화면에서 제거했다. 학년군별 기본 미션을 4개 카테고리의 40개로 늘리고 교사 전용 미션 추가를 구현했다. 학생 우편함은 `내가 맡은 친구`와 `나를 맡은 친구`의 두 대화로 나누며, 쪽지는 첫 대상이나 실제 받은 쪽지의 발신자 한 명에게만 전달한다. 담당 교사는 기록을 확인하고 숨길 수 있다. 학생 카드 명단에는 담당 교사가 개인 코드를 바로 볼 수 있다. 2026-09-28~29 변경의 로컬 검증·개발 백엔드·웹 배포 결과는 [작업일지](docs/work-log.md)를 본다.
- 교사 `상태 확인`에는 시즌 참가자별 완료 미션·보낸 쪽지 수를 표시하며 학생 카드를 열어 미션 상태와 송수신 쪽지를 확인한다. 기존 도움 요청·쪽지 모니터링도 같은 메뉴에서 처리한다. 종전 `학급 설정`은 실제 기능에 맞게 `정보 요청·삭제`로 이름을 바꾸고 요청 접수와 학급 전체 삭제의 차이를 안내한다. [검토 기록](docs/design-reviews/2026-09-28-teacher-student-status.md)을 참고한다.
- 시즌마다 미션을 1~80개 선택할 수 있다. 학생은 선택된 미션을 기간 안에 원하는 순서로 수행한다. 시즌 시작 때 공통 미션 계획을 고정하고 학생별 활동 상태만 기록해 40명 학급의 10개 미션 시작도 단일 트랜잭션으로 처리한다. [이번 변경 검토](docs/design-reviews/2026-09-28-entry-card-flexible-missions-demo.md)에 브라우저 확인 결과와 남은 검수를 기록한다.
- 진행 중 학생 화면과 학생 API에서는 배정된 친구의 이름을 보여주지 않는다. 쪽지는 서버가 자동 전달하고, 교사 공개 승인 후에만 본인 관계를 공개 결과로 확인한다. 예전 시즌 방식으로 저장된 이름도 학생의 Firestore 직접 읽기에서는 차단한다. [비공개 검토](docs/design-reviews/2026-09-28-student-friend-secrecy.md)에 변경과 검증 범위를 기록한다.

- 학생 화면은 [디자인 수정 계획 v2.0](docs/design-revision-plan.md)과 [개발 계획 v2.3](docs/manitto-development-plan.md)에 따라 홈·미션·우편함·우리 반으로 분리했다. 본인 미션 요약·선택·필터·8개씩 탐색과 교사 안내 초안/게시를 구현했다. 학급 실천 숫자는 추정 위험 검토가 남아 **비공개**이며, 우리 반에는 검토된 배려 예시와 게시된 안내만 보인다. [검토 기록](docs/design-reviews/2026-09-28-student-se1-se2-implementation.md) 및 [로그인 수정 검토](docs/design-reviews/2026-09-29-teacher-login-fix.md)에 검증 범위와 남은 항목을 기록했다.

## 구조

- [개발 계획서](docs/manitto-development-plan.md), [데이터 계약](docs/firestore-schema.md), [함수 계약](docs/functions-api.md), [개인정보 처리방침 초안](docs/privacy-policy-draft.md), [작업일지](docs/work-log.md)
- `functions/src`: Firebase Cloud Functions 2세대, Node.js 22, 서울 리전
- `web/`: React·TypeScript·Vite 교사·학생 웹
- `firestore.rules`: 브라우저 직접 쓰기 차단과 학생 본인 보기 격리
- `tests/`: Rules, 계정·카드, 두 회차 통합 시뮬레이션
- `AGENTS.md`: 제품·안전·개발 원칙
- [전문가 프로파일과 검토 절차](docs/experts/README.md): 웹디자이너·UX·UI 각 2개 역할, 서비스 개발 전 필수 검토와 구현 후 확인 기준

## 로컬 실행과 검증

```bash
npm install
npm run build
npm run test:functions
npm run test:rules
npm run test:integration
npm run test:today-tasks
npm run dev:web
```

Firestore 에뮬레이터는 Java 21이 필요하다. `.firebaserc`의 `demo-manitto`는 로컬 전용이고 `dev`는 개발 프로젝트 `manito-938cc`다. `web/.env.example`을 참고해 `web/.env.local`을 설정한다. 에뮬레이터를 별도 터미널에서 시작한 뒤 `http://127.0.0.1:5173/student` 또는 `/teacher`로 접속한다. `web/index.html`을 `file://`로 직접 열면 Vite 앱이 실행되지 않는다.

기본 Emulator 포트가 이미 사용 중이면 `npm run test:rules:isolated`와 `npm run test:integration:isolated`로 별도 포트의 임시 Emulator를 실행할 수 있다.

## 배포

`vercel.json`이 `web/` 빌드와 SPA 경로를 처리한다. Vercel 프로젝트에는 개발 Firebase 웹 API 키를 `VITE_FIREBASE_API_KEY` Config 변수로 넣는다. 개발 프로젝트의 공개 `authDomain`·`projectId`·`appId`는 웹 코드 기본값을 사용한다. 다른 Firebase 프로젝트를 연결하면 해당 프로젝트의 세 값을 `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`로 모두 지정한다. Google 교사 로그인을 위해 Firebase Auth의 Google 제공업체와 Vercel 도메인 허용 설정이 필요하다.

Firebase 개발 백엔드 배포는 프로젝트를 명시한다: `npm run deploy:backend -- manito-938cc --confirm manito-938cc`. GitHub 푸시가 연결된 Vercel 웹 배포를 시작한다. Firebase 배포, GitHub 푸시, Vercel Ready 상태는 각각 확인한다.
