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

## 2. 인증과 App Check 준비

### 웹 앱 등록

**프로젝트 설정 → 일반 → 내 앱 → 웹 앱 추가**에서 웹 앱을 등록한다. 화면에 표시되는 `firebaseConfig`는 추후 프런트엔드 환경 변수로 사용한다. 이 값은 클라이언트 식별 정보이며, 서비스 계정 비밀 키와 다르다.

### 교사 인증 설정

교사는 Firebase Authentication으로 로그인한다. MVP에서는 Google 로그인을 권장한다.

1. **Authentication → Sign-in method**에서 Google 제공업체를 사용 설정한다.
2. 교사 확인 절차를 통과한 계정에 서버에서 `role: "teacher"`, `teacherVerified: true` Custom Claims를 부여한다.
3. 같은 UID로 `teachers/{uid}` 문서를 만들고 `verificationStatus: "verified"`를 저장한다.

2~3번을 자동화하는 교사 승인 관리자 기능은 아직 구현 범위 밖이다. 그 기능을 만들기 전에는 승인용 관리 스크립트가 필요하다. 학생은 이름과 입장 카드로 로그인하며, `loginStudent` 함수가 Firebase Custom Token을 발급하므로 별도의 로그인 제공업체를 켤 필요가 없다.

### App Check 설정

현재 모든 Callable Function은 실제 배포 환경에서 App Check를 강제한다. 웹 앱에 App Check를 등록하고 reCAPTCHA Enterprise 또는 reCAPTCHA v3 공급자를 설정한 뒤, 프런트엔드에서 Firebase Functions를 호출하기 전에 App Check를 초기화해야 한다. 설정 전에는 정상 사용자 요청도 함수에서 거부된다.

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
- `functions`: `createClass`, `registerStudents`, `loginStudent`, `rotateStudentCredential`

로컬 규칙을 배포하면 Console에서 직접 작성한 Firestore 규칙을 덮어쓴다. 규칙 변경은 이 저장소에서 관리한다.

## 4. 배포 결과 확인

```bash
npx firebase functions:list --project PROJECT_ID
npx firebase firestore:indexes --project PROJECT_ID
```

Firebase Console에서도 아래 항목을 확인한다.

1. **Functions**에 함수 4개가 있고 리전이 `asia-northeast3`인지 확인한다.
2. **Firestore Database → Rules**의 게시 시간이 방금 배포한 시각인지 확인한다.
3. **Firestore Database → Indexes**에서 인덱스 빌드가 완료될 때까지 기다린다.
4. 웹 앱에서 App Check가 붙은 호출을 보내고 Functions 로그에 오류가 없는지 확인한다.

## 5. 프런트엔드 연결 전 필요한 작업

백엔드 배포만으로 사용자가 접속할 웹사이트가 생기지는 않는다. 교사용·학생용 첫 입장 웹은 `web/`에 로컬 구현했으며, 배포 대상은 Vercel이다. `vercel.json`이 빌드 출력과 `/teacher`·`/student` 새로고침 경로를 설정한다. Vercel 프로젝트에는 `web/.env.example`의 `VITE_*` 값을 개발 Firebase 웹 앱 설정으로 입력하고 `VITE_USE_EMULATORS=false`를 유지한다. 공개할 Vercel 도메인을 Firebase Auth 허용 도메인과 App Check 웹 등록 범위에 추가한 뒤 가상 계정으로 확인한다. 현재 Vercel과 Firebase 개발 클라우드의 연결은 아직 검증하지 않았다.

프로덕션 공개 전에는 개발 프로젝트의 전체 흐름을 검증한 뒤 별도 운영 프로젝트를 만들고 같은 방식으로 배포한다. 개발 데이터와 실제 학생 데이터를 한 프로젝트에 섞지 않는다.

## 공식 문서

- [Firebase CLI로 프로젝트 관리 및 배포](https://firebase.google.com/docs/cli)
- [Cloud Functions 시작하기](https://firebase.google.com/docs/functions/get-started)
- [Cloud Firestore 시작하기](https://firebase.google.com/docs/firestore/quickstart-server)
- [Firebase 요금제](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
- [Security Rules 배포 관리](https://firebase.google.com/docs/rules/manage-deploy)
