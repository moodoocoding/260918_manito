# Firebase 배포 가이드

이 문서는 마니또 서비스의 Firestore 보안 규칙·인덱스와 Cloud Functions를 실제 Firebase 환경에 배포하는 절차다. 처음에는 운영 프로젝트와 분리된 **개발 프로젝트**를 사용한다.

현재 개발 환경은 표시 이름 `260918 manito`, 프로젝트 ID `manito-938cc`, Firebase 별칭 `dev`를 사용한다. `demo-manitto`는 계속 로컬 Emulator 전용으로 유지한다.

## 1. 배포 대상 준비

### 새 Firebase 프로젝트 만들기

프로젝트 ID는 전 세계에서 유일하며 만든 뒤 바꿀 수 없다. 예시는 `manitto-classroom-dev-taeho`이며, 실제로 사용 가능한 ID를 정해 아래 명령을 실행한다.

```bash
npx firebase projects:create PROJECT_ID --display-name "마니또 개발"
```

Firebase Console에서 직접 만들어도 된다. 현재 저장소의 `.firebaserc`에 적힌 `demo-manitto`는 Emulator 전용이므로 실제 배포에 사용하지 않는다.

### Blaze 요금제 연결

Cloud Functions 배포에는 Blaze 요금제가 필요하다. [Firebase Console](https://console.firebase.google.com/)에서 새 프로젝트를 열고 **프로젝트 설정 → 사용량 및 결제 → 요금제 변경**에서 결제 계정을 연결한다. Blaze는 사용량 기반 과금이므로 예산 알림도 함께 설정한다.

### Firestore 데이터베이스 만들기

서비스 코드의 함수 리전이 서울(`asia-northeast3`)이므로 Firestore도 같은 리전으로 만든다. 데이터베이스 위치는 나중에 바꿀 수 없다.

```bash
npx firebase firestore:databases:create "(default)" \
  --project PROJECT_ID \
  --location asia-northeast3 \
  --edition standard \
  --delete-protection ENABLED
```

Console에서 만들 경우 **Firestore Database → 데이터베이스 만들기 → Standard edition → Production mode → Seoul (`asia-northeast3`)** 순서로 선택한다. 컬렉션은 앱이 처음 데이터를 쓸 때 자동으로 생성되므로 미리 만들 필요가 없다.

## 2. 인증 준비

### 웹 앱 등록

**프로젝트 설정 → 일반 → 내 앱 → 웹 앱 추가**에서 웹 앱을 등록한다. 화면에 표시되는 `firebaseConfig`는 추후 프런트엔드 환경 변수로 사용한다. 이 값은 클라이언트 식별 정보이며, 서비스 계정 비밀 키와 다르다.

### 교사 인증 설정

교사는 Firebase Authentication의 Google 로그인으로 접속한다. 개발 프로젝트에서는 제공업체와 Vercel 도메인을 설정했고, 검증된 교사 계정으로 배포 웹의 교사 화면까지 확인했다.

1. **Authentication → Sign-in method**에서 Google 제공업체를 사용 설정한다.
2. 교사 확인 절차를 통과한 계정에 서버에서 `role: "teacher"`, `teacherVerified: true` Custom Claims를 부여한다.
3. 같은 UID로 `teachers/{uid}` 문서를 만들고 `verificationStatus: "verified"`를 저장한다.

2~3번을 자동화하는 교사 승인 관리자 기능은 아직 구현 범위 밖이다. 지금은 운영자가 확인한 계정만 수동 승인한다. 학생은 학급 코드와 개인 입장 카드로 로그인하며, `loginStudent` 함수가 Firebase Custom Token을 발급하므로 별도의 로그인 제공업체를 켤 필요가 없다. 개발 클라우드에서 이 함수의 `iam.serviceAccounts.signBlob` 권한 오류가 확인됐다. 함수 실행 계정의 서비스 계정 서명 권한을 해당 서비스 계정 리소스에 한정해 점검한 뒤 가상 카드로 다시 검증한다.

## 3. 백엔드 배포

Firebase CLI 로그인 상태와 대상을 확인한다.

```bash
npx firebase login:list
npx firebase projects:list
```

그 다음 저장소 루트에서 안전 배포 스크립트를 실행한다. 프로젝트 ID를 두 번 적게 해 잘못된 프로젝트로 배포하는 실수를 줄였다.

```bash
npm run deploy:backend -- PROJECT_ID --confirm PROJECT_ID
```

스크립트는 먼저 TypeScript를 빌드한 뒤 다음 자원을 배포한다.

- `firestore.rules`: Firestore 접근 권한
- `firestore.indexes.json`: 복합 인덱스
- `functions`: 계정·학급·회차·매칭·미션·쪽지·도움·공개·회고·정보 요청 등을 처리하는 40개 Callable

로컬 규칙을 배포하면 Console에서 직접 작성한 Firestore 규칙을 덮어쓴다. 규칙 변경은 이 저장소에서 관리한다.

## 4. 배포 결과 확인

```bash
npx firebase functions:list --project PROJECT_ID
npx firebase firestore:indexes --project PROJECT_ID
```

Firebase Console에서도 아래 항목을 확인한다.

1. **Functions**에 배포된 함수 40개가 있고 리전이 `asia-northeast3`인지 확인한다.
2. **Firestore Database → Rules**의 게시 시간이 방금 배포한 시각인지 확인한다.
3. **Firestore Database → Indexes**에서 인덱스 빌드가 완료될 때까지 기다린다.
4. 가상 교사·학생 계정으로 인증과 권한 검사를 확인하고 Functions 로그에 오류가 없는지 확인한다.

## 5. 프런트엔드 연결 전 필요한 작업

교사용·학생용 웹은 `web/`에 구현해 [Vercel 개발 사이트](https://manito-one-blond.vercel.app)에 배포했다. `vercel.json`이 빌드 출력과 `/teacher`·`/student` 새로고침 경로를 설정한다. Vercel에는 개발 Firebase 웹 API 키를 `VITE_FIREBASE_API_KEY` Config로 설정한다. 개발 프로젝트의 `authDomain`·`projectId`·`appId` 공개 설정은 코드에 기본값이 있으며, 다른 Firebase 프로젝트를 연결할 때는 해당 프로젝트의 세 값을 모두 환경 변수로 지정한다. `VITE_USE_EMULATORS`는 배포 환경에서 켜지 않는다. Google 교사 로그인, 가상 학급·카드 발급, 서버 회차 시작까지 배포 웹에서 확인했다. 학생의 개발 클라우드 Custom Token 로그인은 위 서명 권한 문제로 재검증이 필요하다.

실제 학생 데이터 도입 전에는 [개인정보 처리방침 초안](privacy-policy-draft.md)의 미확정 항목과 별도 운영 프로젝트, 학교·보호자 안내, 권리 요청 처리 절차를 확정한다. 현재 공개 웹은 개발 검증 안내를 표시한다.

프로덕션 공개 전에는 개발 프로젝트의 전체 흐름을 검증한 뒤 별도 운영 프로젝트를 만들고 같은 방식으로 배포한다. 개발 데이터와 실제 학생 데이터를 한 프로젝트에 섞지 않는다.

## 공식 문서

- [Firebase CLI로 프로젝트 관리 및 배포](https://firebase.google.com/docs/cli)
- [Cloud Functions 시작하기](https://firebase.google.com/docs/functions/get-started)
- [Cloud Firestore 시작하기](https://firebase.google.com/docs/firestore/quickstart-server)
- [Firebase 요금제](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
- [Security Rules 배포 관리](https://firebase.google.com/docs/rules/manage-deploy)
