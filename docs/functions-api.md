# 교사·학생 계정 Functions API v0.1

모든 함수는 `asia-northeast3`의 Firebase Callable Function이다. 운영 환경에서는 App Check가 필수이며, Firestore 쓰기는 이 함수들만 수행한다.

## 공통 규칙

- `requestId`는 클라이언트가 한 사용자 행동마다 생성하는 8~64자의 영문·숫자·`_`·`-` 문자열이다.
- 같은 `requestId`를 네트워크 재시도로 다시 보내도 학급이나 학생이 중복 생성되지 않는다.
- 학생 카드 원문은 최초 등록·재발급 응답에서 한 번만 반환되고 DB에는 저장되지 않는다.
- 카드 응답을 잃으면 기존 카드를 조회할 수 없으므로 교사가 재발급한다.
- 학생 카드 재발급은 `sessionVersion`을 올려 기존 로그인 세션도 즉시 읽기 권한을 잃게 한다.

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

둘 중 하나라도 없으면 학급·학생 관리 함수가 거절된다. 실제 운영 전에는 별도 운영자 도구와 교사 확인 절차를 구현한다.

