# 마니또 서비스 작업일지

이 문서는 프로젝트 진행 내용을 날짜순으로 누적한다. 완료된 작업과 아직 구현되지 않은 범위를 구분해 기록하며, 새로운 작업은 문서 하단에 추가한다.

## 2026-09-18 — 서비스 기획

### 목표와 사용자 정의

- 초등학교 교사와 초등학생이 사용하는 반복형 마니또 웹서비스로 범위를 정했다.
- 한 번 매칭하고 끝나는 행사가 아니라, 같은 학급에서 여러 회차를 만들고 지난 활동을 돌아볼 수 있도록 설계했다.
- 교사가 운영하는 **방장 서비스**와 학생이 참여하는 **회원 서비스**를 분리했다.
- 서비스 분위기는 초등학생이 부담 없이 접근할 수 있는 귀엽고 장난스러운 방향으로 정했다.

### 핵심 운영 흐름

- 교사: 학급 생성 → 학생 명단 등록 → 회차 생성 → 매칭 실행 → 미션 운영 → 도움 요청·메시지 확인 → 정체 공개 → 회고
- 학생: 입장 카드 로그인 → 자신의 마니또 확인 → 미션 수행 → 익명 쪽지·응원 → 도움 요청 → 정체 공개 → 회고
- 반복 참여를 위해 학급과 회차를 분리하고, 한 학급에 여러 회차가 누적되는 구조를 채택했다.
- 초등학생 대상 서비스라는 점을 반영해 교사 통제, 최소 개인정보, 익명 상호작용 검토, 신고·도움 요청 기능을 기획에 포함했다.

### 산출물

- [서비스 개발 계획서](./manitto-development-plan.md)

## 2026-09-21 — Firebase 백엔드 설계 및 구현

### Firestore 데이터 구조

- 교사, 학급, 학생, 회차, 매칭, 미션, 메시지, 도움 요청, 감사 카드, 감사 로그를 표현하는 Firestore 경로와 데이터 계약을 설계했다.
- 클라이언트가 매칭 결과나 권한 데이터를 임의로 바꾸지 못하도록 중요한 쓰기는 Cloud Functions만 수행하게 했다.
- 학급과 회차를 분리해 같은 학급에서 여러 번 마니또 활동을 진행할 수 있도록 했다.
- 교사 대시보드와 학생 화면에서 필요한 복합 인덱스 5개를 정의했다.

### 보안 규칙

- 교사는 자신이 담당하는 학급의 운영 데이터만 읽도록 제한했다.
- 학생은 자신이 속한 학급·회차에서 허용된 데이터만 읽도록 제한했다.
- 학생에게 자신의 대상자만 공개하고 전체 매칭표는 직접 조회할 수 없도록 설계했다.
- 클라이언트의 직접 쓰기를 기본 차단하고 서버 함수에서 검증된 요청만 처리하도록 했다.
- 입장 카드 재발급 시 `sessionVersion`을 증가시켜 기존 학생 세션을 무효화하도록 했다.

### Cloud Functions

다음 Callable Function 4개를 TypeScript로 구현했다.

- `createClass`: 확인된 교사가 새 학급을 생성
- `registerStudents`: 학급에 학생을 일괄 등록하고 입장 카드 발급
- `loginStudent`: 학급 코드와 입장 카드 검증 후 Firebase Custom Token 발급
- `rotateStudentCredential`: 분실·노출된 학생 입장 카드를 교사가 재발급

학생 입장 카드의 원문은 저장하지 않고 salt가 포함된 scrypt 해시만 저장한다. 운영 환경의 Callable Function에는 App Check 검증을 적용하고, Emulator에서만 이를 해제했다.

### 검증

- TypeScript 빌드 통과
- 입장 코드 관련 단위 테스트 4개 통과
- Firestore 보안 규칙 테스트 8개 통과
- 통합 흐름 테스트 1개 통과
  - 교사 학급 생성
  - 학생 등록
  - 학생 로그인
  - 학생의 직접 쓰기 차단
  - 카드 재발급 후 기존 카드와 세션 무효화
  - 새 카드 로그인 성공

### 배포 준비

- Firebase Emulator 구성을 추가했다.
- 실제 프로젝트 오배포를 막기 위해 프로젝트 ID를 두 번 확인하는 `scripts/deploy-backend.mjs`를 만들었다.
- Firestore와 Functions 배포 절차, 서울 리전 선택, App Check·교사 인증 요구사항을 문서화했다.
- `.firebaserc`의 기본 프로젝트 `demo-manitto`는 로컬 Emulator 전용으로 유지했다.

### 산출물

- [Firestore 스키마](./firestore-schema.md)
- [Functions API](./functions-api.md)
- [Firebase 배포 가이드](./firebase-deployment.md)
- `firestore.rules`
- `firestore.indexes.json`
- `functions/src`
- `tests`

## 2026-09-27 — GitHub 연결 및 Firebase 백엔드 배포

### Git·GitHub

- 로컬 프로젝트를 Git 저장소로 초기화했다.
- 원격 저장소 [moodoocoding/260918_manito](https://github.com/moodoocoding/260918_manito)에 연결했다.
- 초기 백엔드 코드와 문서를 `main` 브랜치에 푸시했다.
- Firebase 개발 프로젝트 별칭을 `.firebaserc`에 `dev`로 추가했다.

### Firebase 개발 프로젝트

- 표시 이름: `260918 manito`
- 프로젝트 ID: `manito-938cc`
- 별칭: `dev`
- Firestore: `(default)`, Standard 에디션, 서울 `asia-northeast3`
- 삭제 방지: 활성화
- Functions: Node.js 22, 2세대, 서울 `asia-northeast3`

### 배포 내용

- Firestore 보안 규칙 배포 완료
- Firestore 복합 인덱스 5개 배포 완료
- 다음 Cloud Functions 4개 배포 완료
  - `createClass`
  - `registerStudents`
  - `loginStudent`
  - `rotateStudentCredential`
- Cloud Functions 컨테이너 이미지가 누적되지 않도록 30일 자동 정리 정책을 설정했다.

### 배포 중 문제와 해결

- Firebase CLI 인증 토큰이 만료되어 Google 계정 재인증을 진행했다.
- 새 프로젝트에서 Firestore API가 비활성화되어 API를 활성화한 뒤 데이터베이스를 생성했다.
- Cloud Run과 관련 API를 처음 활성화한 직후 권한 전파가 끝나지 않아 Functions 생성이 일부 실패했다.
- 성공한 함수는 유지하고 실패한 함수만 나누어 재배포해 최종적으로 4개 함수가 모두 등록된 것을 확인했다.

### 확인 결과

- Firebase CLI에서 함수 4개가 모두 `callable`, `v2`, `nodejs22`, `asia-northeast3`로 조회됐다.
- Firestore 기본 데이터베이스가 `STANDARD`, `FIRESTORE_NATIVE`로 조회됐다.
- 배포한 복합 인덱스 5개가 원격 프로젝트에서 조회됐다.
- GitHub `main`과 로컬 브랜치가 같은 커밋을 가리키는 것을 확인했다.

## 현재 상태

현재 완료된 범위는 **백엔드 기반 구축과 Firebase 배포**다. 실제 사용자가 접속해 활동할 웹서비스 화면은 아직 구현하지 않았다.

### 완료

- 서비스 기획과 사용자 흐름
- Firestore 데이터 계약
- Firestore 보안 규칙과 인덱스
- 학급 생성 및 학생 등록·로그인·카드 재발급 함수
- 로컬 자동 테스트
- GitHub 저장소 연결
- Firebase 개발 프로젝트 백엔드 배포

### 미구현

- 교사용 웹 화면과 학생용 웹 화면
- Firebase 웹 앱 등록과 프런트엔드 환경 설정
- 교사 Google 로그인 UI와 교사 승인 관리 도구
- App Check 웹 공급자 설정과 클라이언트 초기화
- 회차 생성·명단 확정·마니또 자동 매칭 함수
- 미션 생성·배정·수행 확인
- 익명 쪽지, 교사 검토, 도움 요청 운영 화면
- 정체 공개, 회고, 지난 회차 보기
- Firebase Hosting 배포와 실제 접속 주소
- 접근성, 모바일 화면, 초등학생 사용성 검증

## 다음 작업 순서

1. 프런트엔드 기술 구성을 확정하고 교사용·학생용 기본 화면을 만든다.
2. Firebase 웹 앱을 등록하고 Auth, Functions, Firestore, App Check를 연결한다.
3. 교사 로그인·승인과 학생 입장 카드 로그인 흐름을 화면에서 완성한다.
4. 회차 생성과 서버 매칭 기능을 구현한다.
5. 미션·쪽지·도움 요청·공개·회고 기능을 순서대로 구현한다.
6. 개발 프로젝트에서 전체 흐름을 검증한 뒤 별도 운영 프로젝트와 Hosting을 구성한다.
