# 우리 반 비밀친구

대한민국 초등학교 교사와 학생을 위한 반복형 마니또 웹서비스다. 한 학급에서 여러 회차를 운영하고 학생은 개인 입장 카드로 참여한다. 실제 학생 데이터 도입 전에는 개인정보 처리 근거, 학교·보호자 안내, 보존·권리 요청 절차를 확정해야 한다.

## 현재 상태 (2026-09-28)

- D1 학급·학생 카드·로그인·로그아웃은 Firebase 개발 프로젝트 `manito-938cc`와 [Vercel 개발 웹](https://manito-one-blond.vercel.app)에 배포됐다.
- D2~D5 시즌·서버 매칭·학년군별 기본 미션 40개와 교사 미션 추가·1:1 익명 쪽지와 답장·교사 모니터링·도움 요청·공개·회고·설정 복사·학급 삭제 기능을 구현했다. `demo-manitto` 에뮬레이터로 가상 학급 두 시즌과 40명 매칭을 검증했다. Firebase 개발 백엔드와 Vercel 웹의 최신 배포 결과는 [작업일지](docs/work-log.md)를 본다.
- Firebase Google 로그인 제공업체와 Vercel 허용 도메인을 설정하고 가상 교사를 승인했다. 개발 클라우드의 Custom Token 서명 권한을 복구했고 배포 웹에서 가상 학생 로그인, 미션·도움·공개·감사·회고, 설정을 복사한 두 번째 회차의 공개·보관까지 확인했다. 학생 정보 요청은 접수 단계이며 개별 정정·삭제 처리 절차와 실제 학생 운영용 별도 프로젝트도 아직 없다.
- App Check와 reCAPTCHA는 사용자 결정에 따라 사용하지 않는다. 인증, 카드 실패 잠금, 세션 버전, 함수 권한 검사, Firestore Rules와 요청 멱등성을 유지한다.
- 사용자의 요청에 따라 화면의 공통 개발 검증 안내는 제거했다. 실제 학생 데이터 사용 전 개인정보 처리방침과 학교·보호자 안내 절차를 확정해야 한다. [개인정보 처리방침 초안](docs/privacy-policy-draft.md)은 운영 주체·연락처·보유 기간 등이 미확정인 검토 문서다.
- [디자인 수정 계획서](docs/design-revision-plan.md)의 교사·학생 업무별 페이지, 선택 행과 대비, 안전 원문 가림을 코드에 적용했다. 현재 시즌 준비는 5단계다. 가상 학급의 인증 후 교사 320·360·390·768px, 학생 320px 화면과 A4 카드 1·40장 출력 데이터를 검증했고 빌드·함수·Rules·통합 테스트를 통과했다. [구현 후 검토](docs/design-reviews/2026-09-28-season-missions-messages-cards.md)에 200% 확대·VoiceOver·물리 인쇄·사용자 관찰 등 미완료 검수를 구분했다. 디자인 전체 완료 판정은 아직 아니다.
- 교사 메뉴에서 `시즌 설정`을 운영 요약 다음에 두고 시작·종료일과 5/10/15/20일 빠른 선택을 제공한다. `입장 카드`에서 전체·선택 출력, 이름별 차단/해제와 재발급 후 즉시 출력을 제공한다. 신규 카드는 서버 전용 암호문으로 재출력하고, 이전 카드는 확인 후 재발급한다. [카드·시즌 검토](docs/design-reviews/2026-09-27-cards-and-seasons.md)에 이 변경의 검증 범위와 남은 확인을 기록한다.
- 시즌 준비를 기본 정보·참가자·미션·쪽지·확인/저장 5단계로 나누고, 수업일 개별 입력은 기본 화면에서 제거했다. 학년군별 기본 미션을 4개 카테고리의 40개로 늘리고 교사 전용 미션 추가를 구현했다. 쪽지는 배정된 친구에게 첫 쪽지, 받은 쪽지의 발신자에게 익명 답장을 즉시 전달하며 담당 교사가 기록을 확인하고 숨길 수 있다. 학생 카드 명단에는 담당 교사가 개인 코드를 바로 볼 수 있다. 2026-09-28 변경의 로컬 검증·개발 백엔드·웹 배포 결과는 [작업일지](docs/work-log.md)를 본다.
- 시즌마다 미션을 1~80개 선택할 수 있다. 학생은 선택된 미션을 기간 안에 원하는 순서로 수행한다. 시즌 시작 때 공통 미션 계획을 고정하고 학생별 활동 상태만 기록해 40명 학급의 10개 미션 시작도 단일 트랜잭션으로 처리한다. [이번 변경 검토](docs/design-reviews/2026-09-28-entry-card-flexible-missions-demo.md)에 브라우저 확인 결과와 남은 검수를 기록한다.

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
npm run dev:web
```

Firestore 에뮬레이터는 Java 21이 필요하다. `.firebaserc`의 `demo-manitto`는 로컬 전용이고 `dev`는 개발 프로젝트 `manito-938cc`다. `web/.env.example`을 참고해 `web/.env.local`을 설정한다. 에뮬레이터를 별도 터미널에서 시작한 뒤 `http://127.0.0.1:5173/student` 또는 `/teacher`로 접속한다. `web/index.html`을 `file://`로 직접 열면 Vite 앱이 실행되지 않는다.

기본 Emulator 포트가 이미 사용 중이면 `npm run test:rules:isolated`와 `npm run test:integration:isolated`로 별도 포트의 임시 Emulator를 실행할 수 있다.

## 배포

`vercel.json`이 `web/` 빌드와 SPA 경로를 처리한다. Vercel 프로젝트에는 개발 Firebase 웹 API 키를 `VITE_FIREBASE_API_KEY` Config 변수로 넣는다. 개발 프로젝트의 공개 `authDomain`·`projectId`·`appId`는 웹 코드 기본값을 사용한다. 다른 Firebase 프로젝트를 연결하면 해당 프로젝트의 세 값을 `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`로 모두 지정한다. Google 교사 로그인을 위해 Firebase Auth의 Google 제공업체와 Vercel 도메인 허용 설정이 필요하다.

Firebase 개발 백엔드 배포는 프로젝트를 명시한다: `npm run deploy:backend -- manito-938cc --confirm manito-938cc`. GitHub 푸시가 연결된 Vercel 웹 배포를 시작한다. Firebase 배포, GitHub 푸시, Vercel Ready 상태는 각각 확인한다.
