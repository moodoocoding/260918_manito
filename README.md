# 우리 반 비밀친구

초등학교 교사와 학생을 위한 반복형 마니또 웹서비스다. D1 첫 입장 웹은 [Vercel 개발 사이트](https://manito-one-blond.vercel.app)에 배포했고, Firebase 개발 프로젝트에는 계정·학급 함수 9개와 Firestore Rules·인덱스를 배포했다. 실제 학생 대상 운영과 회차 기능은 아직 준비 중이다.

## 현재 구성

- `AGENTS.md`: 제품 원칙, 구현 불변 조건, 검증·문서화 지침
- [서비스 개발 계획서 v2.1](docs/manitto-development-plan.md): 현재 상태, 화면 명세, 인증 보강, D1~D6 개발 순서·완료 기준
- `docs/ui-concept.md`: 학생·교사 대표 UI 시안과 디자인 방향
- `docs/work-log.md`: 날짜별 작업 내용과 현재 구현 범위
- `docs/firestore-schema.md`: Firestore 경로, 권한, 불변 조건
- `firestore.rules`: 교사·학생 읽기 권한과 기본 쓰기 차단
- `firestore.indexes.json`: 첫 화면과 운영 대시보드용 인덱스
- `tests/firestore.rules.test.mjs`: 권한 격리 테스트
- `functions/src/domain/schema.ts`: 서버 구현에 사용할 TypeScript 데이터 타입
- `docs/functions-api.md`: 교사·학생 계정 Callable API 계약
- `functions/src`: 학급 생성, 학생 등록·로그인·카드 재발급 함수
- `web/`: 교사·학생 첫 입장 웹, 학급·카드 관리, 학생 준비 화면
- `vercel.json`: Vite 빌드와 SPA 경로 설정

## 로컬 확인

```bash
npm install
npm run build
npm run test:functions
npm run test:rules
npm run test:integration
npm run dev:web
```

Firestore 에뮬레이터는 Java가 필요하다. `.firebaserc`의 `demo-manitto`는 로컬 전용이며, 배포된 개발 프로젝트는 `dev` 별칭의 `manito-938cc`다. 로컬 웹 실행 전 `web/.env.example`을 복사해 `web/.env.local`을 설정한다. 배포 환경에서는 Emulator 모드를 사용하지 않는다.

`web/index.html`을 `file://` 주소로 직접 열면 화면이 렌더링되지 않는다. 개발 중에는 저장소 루트에서 `npm run dev:web`을 실행하고 터미널에 표시된 `http://127.0.0.1:5173/student`로 접속한다. 로그인까지 확인하려면 별도 터미널에서 `npm run emulators`도 실행한다.

## Vercel 배포 준비

Vercel `manito` 프로젝트는 GitHub 저장소와 연결했고 `main`의 `a229d5f` 배포가 Ready 상태다. [학생 입장](https://manito-one-blond.vercel.app/student)과 [선생님 방](https://manito-one-blond.vercel.app/teacher)의 렌더링, 가상 카드의 오류 응답을 확인했다. `vercel.json`이 `web/` 빌드와 SPA 경로를 처리한다. 개발 Firebase 웹 앱 `manito-web-dev`의 `VITE_FIREBASE_API_KEY`는 Vercel Production·Preview의 Config 변수로 등록했다. 개발 프로젝트의 공개 `authDomain`·`projectId`·`appId`는 코드의 기본값을 사용한다. 다른 Firebase 프로젝트를 연결할 때는 해당 프로젝트의 세 값을 `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`로 모두 설정해야 한다. App Check와 reCAPTCHA 설정은 요구하지 않는다. 교사 로그인에는 Vercel 도메인을 Firebase Auth 허용 도메인에 추가하고 Google 로그인 제공업체를 켜야 한다.

## 다음 구현 순서

1. D1: 기존 인증·권한 보강, React·TypeScript·Vite 웹 기반, 교사 승인·학급·명부·카드 인쇄, 학생 로그인·홈 조회·로그아웃
2. D2: 회차 생성·명단 확정·서버 매칭·상태 전이·참여 중단
3. D3: 검토된 미션 30개와 배정·완료·교체·쉬기
4. D4: 쪽지 검토·전달, 숨김·신고·도움 요청
5. D5: 공개·감사·회고·다음 회차·보관·삭제와 학생 도입 준비
6. D6: 가상 학급 두 회차 E2E, 공용기기·접근성·장애 검증 후 비공개 시범 준비

첫 시연 목표는 **교사 승인 → 학급·학생 등록 → 카드 인쇄 → 학생 로그인 → 준비 안내 → 안전한 로그아웃**이다. 로컬 Emulator에서 학생 입장·로그아웃을 확인했다. Vercel 화면은 배포됐으며 Google 로그인 설정, 개발 클라우드의 토큰 서명 권한과 실제 카드 로그인 검증은 아직 남아 있다.
