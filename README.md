# 우리 반 비밀친구

초등학교 교사와 학생을 위한 반복형 마니또 웹서비스다. 현재 단계는 Firebase 백엔드 기반 구축과 개발 프로젝트 배포까지 완료됐으며, 프런트엔드는 아직 구현하지 않았다.

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

## 로컬 확인

```bash
npm install
npm run build
npm run test:functions
npm run test:rules
npm run test:integration
```

Firestore 에뮬레이터는 Java가 필요하다. `.firebaserc`의 `demo-manitto`는 로컬 전용이며, 배포된 개발 프로젝트는 `dev` 별칭의 `manito-938cc`다.

## 다음 구현 순서

1. D1: 기존 인증·권한 보강, React·TypeScript·Vite 웹 기반, 교사 승인·학급·명부·카드 인쇄, 학생 로그인·홈 조회·로그아웃
2. D2: 회차 생성·명단 확정·서버 매칭·상태 전이·참여 중단
3. D3: 검토된 미션 30개와 배정·완료·교체·쉬기
4. D4: 쪽지 검토·전달, 숨김·신고·도움 요청
5. D5: 공개·감사·회고·다음 회차·보관·삭제와 학생 도입 준비
6. D6: 가상 학급 두 회차 E2E, 공용기기·접근성·장애 검증 후 비공개 시범 준비

첫 시연 목표는 **교사 승인 → 학급·학생 등록 → 카드 인쇄 → 학생 로그인 → 준비 안내 → 안전한 로그아웃**이다. 현재 배포된 함수의 웹 App Check·인증 흐름과 계획서의 기존 백엔드 보강 과제는 후속 개발에서 검증한다.
