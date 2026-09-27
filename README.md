# 우리 반 비밀친구

대한민국 초등학교 교사와 학생을 위한 반복형 마니또 웹서비스다. 한 학급에서 여러 회차를 운영하고 학생은 개인 입장 카드로 참여한다. 실제 학생 데이터 도입 전에는 개인정보 처리 근거, 학교·보호자 안내, 보존·권리 요청 절차를 확정해야 한다.

## 현재 상태 (2026-09-27)

- D1 학급·학생 카드·로그인·로그아웃은 Firebase 개발 프로젝트 `manito-938cc`와 [Vercel 개발 웹](https://manito-one-blond.vercel.app)에 배포됐다.
- D2~D5 회차·서버 매칭·30개 미션·쪽지 검토·도움 요청·공개·회고·설정 복사·학급 삭제와 추가 안전·정보 요청 접수 기능을 Firebase 개발 프로젝트에 배포했다. `demo-manitto` 에뮬레이터로 가상 학급 두 회차와 40명 매칭을 검증하고, 인증 후 학생 브라우저 흐름을 확인했다. 최신 웹 커밋도 Vercel Production에서 Ready다. 세부 결과는 [작업일지](docs/work-log.md)를 본다.
- Firebase Google 로그인 제공업체와 Vercel 허용 도메인을 설정했다. 배포 웹에서 Google 로그인 후 교사 승인 대기 화면까지 확인했다. 관리자 승인을 거친 학급·학생 카드의 개발 클라우드 전체 흐름은 아직 검증 중이다. 학생 정보 요청은 접수 단계이며 개별 정정·삭제 처리 절차와 실제 학생 운영용 별도 프로젝트도 아직 없다.
- App Check와 reCAPTCHA는 사용자 결정에 따라 사용하지 않는다. 인증, 카드 실패 잠금, 세션 버전, 함수 권한 검사, Firestore Rules와 요청 멱등성을 유지한다.
- 사이트에 개발 검증 안내를 표시한다. 실제 학생 데이터 사용 전 개인정보 처리방침과 학교·보호자 안내 절차를 확정해야 한다. [개인정보 처리방침 초안](docs/privacy-policy-draft.md)은 운영 주체·연락처·보유 기간 등이 미확정인 검토 문서다.

## 구조

- [개발 계획서](docs/manitto-development-plan.md), [데이터 계약](docs/firestore-schema.md), [함수 계약](docs/functions-api.md), [개인정보 처리방침 초안](docs/privacy-policy-draft.md), [작업일지](docs/work-log.md)
- `functions/src`: Firebase Cloud Functions 2세대, Node.js 22, 서울 리전
- `web/`: React·TypeScript·Vite 교사·학생 웹
- `firestore.rules`: 브라우저 직접 쓰기 차단과 학생 본인 보기 격리
- `tests/`: Rules, 계정·카드, 두 회차 통합 시뮬레이션
- `AGENTS.md`: 제품·안전·개발 원칙

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

## 배포

`vercel.json`이 `web/` 빌드와 SPA 경로를 처리한다. Vercel 프로젝트에는 개발 Firebase 웹 API 키를 `VITE_FIREBASE_API_KEY` Config 변수로 넣는다. 개발 프로젝트의 공개 `authDomain`·`projectId`·`appId`는 웹 코드 기본값을 사용한다. 다른 Firebase 프로젝트를 연결하면 해당 프로젝트의 세 값을 `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`로 모두 지정한다. Google 교사 로그인을 위해 Firebase Auth의 Google 제공업체와 Vercel 도메인 허용 설정이 필요하다.

Firebase 개발 백엔드 배포는 프로젝트를 명시한다: `npm run deploy:backend -- manito-938cc --confirm manito-938cc`. GitHub 푸시가 연결된 Vercel 웹 배포를 시작한다. Firebase 배포, GitHub 푸시, Vercel Ready 상태는 각각 확인한다.
