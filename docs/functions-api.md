# 교사·학생 계정 Functions API v0.2

모든 함수는 `asia-northeast3`의 Firebase Callable Function이다. 운영 환경에서는 App Check가 필수이며, Firestore 쓰기는 이 함수들만 수행한다.

## 공통 규칙

- `requestId`는 클라이언트가 한 사용자 행동마다 생성하는 8~64자의 영문·숫자·`_`·`-` 문자열이다.
- 같은 `requestId`를 네트워크 재시도로 다시 보내도 학급이나 학생이 중복 생성되지 않는다.
- 학생 카드 원문은 최초 등록·재발급 응답에서 한 번만 반환되고 DB에는 저장되지 않는다.
- 카드 응답을 잃으면 기존 카드를 조회할 수 없으므로 교사가 재발급한다.
- 학생 카드 재발급은 `sessionVersion`을 올려 기존 로그인 세션도 즉시 읽기 권한을 잃게 한다.
- 재시도 명령은 작업 종류·요청자·정규화한 입력의 fingerprint가 같을 때만 같은 `requestId`를 인정한다. 다른 입력 또는 다른 명령으로 재사용하면 `already-exists`다.
- 운영 환경은 App Check limited-use 토큰을 사용하며 이미 소비된 토큰은 `permission-denied`다. 업무 재시도에는 새 App Check 토큰과 같은 `requestId`를 사용한다.

## `createClass`

확인된 교사만 호출한다.

```ts
request: {
  name: string;                         // 1~40자
  schoolYear: number;                   // 현재 연도 ±1
  gradeBand: "lower" | "middle" | "upper";
  requestId: string;
}
response: {
  classId: string;
  classCode: string;                    // 8자, 학급 입장용
}
```

## `registerStudents`

담당 교사가 학급에 학생 1~40명을 추가한다. 학급 전체 최대 인원도 40명이다. 동일 이름은 허용하며 UID로 구분한다.

```ts
request: {
  classId: string;
  displayNames: string[];
  requestId: string;
}
response: {
  students: Array<{
    studentUid: string;
    displayName: string;
    cardCode: string;                   // 최초 성공 응답에서만 제공
  }>;
  requiresCredentialRotation: boolean; // 재시도 응답이면 true
}
```

`scrypt` 해시는 메모리 사용 급증을 막기 위해 학생별로 순차 처리한다.
재시도 시 학급 소유권을 다시 확인한다. 같은 명령의 응답을 잃은 경우 등록 학생 ID와 이름을 반환하되 카드 원문은 반환하지 않고 `requiresCredentialRotation: true`로 안내한다.

## `loginStudent`

로그인 전 학생이 호출한다. 오류는 학급·학생 존재 여부를 구분하지 않는 공통 메시지로 반환한다. 알려진 카드의 비밀번호가 5회 틀리면 15분간 잠근다.

```ts
request: {
  classCode: string;
  cardCode: string; // `ABCD-EFGHJKLM` 형태
}
response: {
  customToken: string;
  classId: string;
}
```

웹 클라이언트는 받은 토큰을 `signInWithCustomToken`에 전달하고 공용기기에서는 세션 지속성을 사용한다.
비밀 코드 검증 뒤 자격·명부·학급 상태를 트랜잭션에서 다시 확인한다. 재발급이 겹치면 이전 카드로 새 세션 버전의 토큰을 만들지 않는다.

## `rotateStudentCredential`

담당 교사가 분실·노출된 학생 카드를 교체한다. 같은 요청의 응답을 잃은 경우 새 `requestId`로 다시 재발급한다.

```ts
request: {
  classId: string;
  studentUid: string;
  requestId: string;
}
response: {
  studentUid: string;
  cardCode: string;
}
```

## 교사 계정 준비

현재 공개 교사 가입 함수는 제공하지 않는다. 운영자가 교사를 확인한 뒤 다음 두 조건을 함께 설정해야 한다.

1. Auth Custom Claims: `role: "teacher"`, `teacherVerified: true`
2. `teachers/{uid}`: `verificationStatus: "verified"`

둘 중 하나라도 없으면 학급·학생 관리 함수가 거절된다. D1에서 로컬 관리자 실행 도구를 추가했으며 실제 운영 전에는 운영자 권한·교사 확인 절차를 확정한다.

## D1 로컬 추가 함수

모두 `asia-northeast3`의 Callable Function이다. 아래 추가 함수는 로컬 코드와 Emulator에서 구현·검증했으며 Firebase 개발 프로젝트에는 아직 배포하지 않았다.

| 함수 | 요청 | 응답 | 권한·오류 |
|---|---|---|---|
| `getTeacherStatus` | `null` | `{ status: "pending" \| "verified" \| "suspended", displayName }` | 로그인한 비학생만 조회. Claims와 교사 문서가 모두 확인돼야 `verified` |
| `listClasses` | `null` | `{ classes: [{ classId, name, schoolYear, gradeBand, memberCount }] }` | 확인된 교사만 담당 활성 학급 조회 |
| `getClassAccessInfo` | `{ classId }` | `{ classId, classCode, name, schoolYear, gradeBand, memberCount }` | 담당 교사만 학급 코드를 재조회. 다른 학급은 `permission-denied` |
| `getStudentHome` | `null` | `{ displayName, className, round: null \| { title, status, targetDisplayName } }` | 학생 본인 토큰·세션 버전·소속 확인. 회차 없으면 `round: null`; 다른 명부 없음 |
| `setStudentAccess` | `{ classId, studentUid, status: "active" \| "blocked", requestId }` | `{ studentUid, status }` | 담당 교사만 변경, 세션 버전 증가, 감사 기록. 같은 요청 재시도는 동일 결과 |

`scripts/manage-teacher.mjs`는 Callable이 아닌 신뢰된 관리자 실행 환경의 도구다. ADC의 Firebase Auth·Firestore 관리 권한이 있는 운영자만 사용한다. `--project=manito-938cc --uid=... --status=verified|suspended --operator=...`를 명시한다. 승인 시 교사 문서를 `pending`으로 먼저 두고 Claims를 설정한 뒤 `verified`로 바꾼다. 중지는 문서를 먼저 `suspended`로 바꾼다. 중간 실패는 접근 거절 상태로 남으며 같은 명령을 재실행해 복구할 수 있다. 실행 감사 기록은 `operatorAuditLogs`에 남긴다. 실제 학생 데이터 도입 전 관리자 식별·권한 운영 절차를 확정한다.
