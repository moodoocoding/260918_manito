# 우리 반 비밀친구

초등학교 교사와 학생을 위한 반복형 마니또 웹서비스다. Firebase 개발 프로젝트에는 계정·학급 백엔드 4개 함수가 배포되어 있고, D1 첫 입장 웹과 인증 보강은 로컬에서 구현·검증 중이다. 웹 배포 대상은 Vercel이다.

## 현재 구성

- `AGENTS.md`: 제품 원칙, 구현 불변 조건, 검증·문서화 지침
- [서비스 개발 계획서 v2.0](docs/manitto-development-plan.md): 현재 상태, 화면 명세, 인증 보강, D1~D6 개발 순서·완료 기준
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

Firestore 에뮬레이터는 Java가 필요하다. `.firebaserc`의 `demo-manitto`는 로컬 전용이며, 배포된 개발 프로젝트는 `dev` 별칭의 `manito-938cc`다. 로컬 웹 실행 전 `web/.env.example`을 복사해 `web/.env.local`을 설정한다. Vercel 빌드에도 같은 `VITE_*` 값을 설정하며, Emulator 모드는 배포 환경에서 사용하지 않는다.

`web/index.html`을 `file://` 주소로 직접 열면 화면이 렌더링되지 않는다. 개발 중에는 저장소 루트에서 `npm run dev:web`을 실행하고 터미널에 표시된 `http://127.0.0.1:5173/student`로 접속한다. 로그인까지 확인하려면 별도 터미널에서 `npm run emulators`도 실행한다.

## Vercel 배포 준비

Vercel 프로젝트의 루트 디렉터리는 저장소 루트로 둔다. `vercel.json`이 `web/` 빌드와 SPA 경로를 처리한다. Firebase 웹 앱을 개발 프로젝트에 등록한 뒤 Vercel의 빌드 환경 변수에 `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`를 설정하고 `VITE_USE_EMULATORS=false`로 둔다. Vercel 도메인을 Firebase Auth 허용 도메인과 App Check 웹 설정에 등록한다. 값이 빠지면 웹 빌드가 실패하도록 설정했다. 실제 미리보기 배포와 클라우드 인증 검증은 아직 진행하지 않았다.

## 다음 구현 순서

1. D1: 기존 인증·권한 보강, React·TypeScript·Vite 웹 기반, 교사 승인·학급·명부·카드 인쇄, 학생 로그인·홈 조회·로그아웃
2. D2: 회차 생성·명단 확정·서버 매칭·상태 전이·참여 중단
3. D3: 검토된 미션 30개와 배정·완료·교체·쉬기
4. D4: 쪽지 검토·전달, 숨김·신고·도움 요청
5. D5: 공개·감사·회고·다음 회차·보관·삭제와 학생 도입 준비
6. D6: 가상 학급 두 회차 E2E, 공용기기·접근성·장애 검증 후 비공개 시범 준비

첫 시연 목표는 **교사 승인 → 학급·학생 등록 → 카드 인쇄 → 학생 로그인 → 준비 안내 → 안전한 로그아웃**이다. 로컬 Emulator에서 학생 입장·로그아웃을 확인했다. Firebase 웹 앱 등록, Vercel 미리보기 배포, 개발 클라우드의 App Check·서명 권한 검증은 아직 남아 있다.
