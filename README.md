# 우리 반 비밀친구

초등학교 교사와 학생을 위한 반복형 마니또 웹서비스다. 현재 단계는 Firebase 백엔드 기반 구축과 개발 프로젝트 배포까지 완료됐으며, 프런트엔드는 아직 구현하지 않았다.

## 현재 구성

- `AGENTS.md`: 제품 원칙, 구현 불변 조건, 검증·문서화 지침
- `docs/manitto-development-plan.md`: 제품·운영·개발 계획
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

1. 교사 운영자 확인 도구와 웹 로그인 화면
2. 회차 생성·명단 확정·서버 매칭
3. 미션, 쪽지 검토, 도움 요청
4. 공개·회고·다음 회차
