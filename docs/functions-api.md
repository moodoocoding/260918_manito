# 교사·학생 계정 Functions API v0.2

모든 함수는 `asia-northeast3`의 Firebase Callable Function이다. App Check는 사용하지 않는다. 각 함수는 Firebase Auth·업무 권한을 검증하며, Firestore 쓰기는 이 함수들만 수행한다.

## 공통 규칙

- `requestId`는 클라이언트가 한 사용자 행동마다 생성하는 8~64자의 영문·숫자·`_`·`-` 문자열이다.
- 같은 `requestId`를 네트워크 재시도로 다시 보내도 학급이나 학생이 중복 생성되지 않는다.
- 학생 카드 원문은 최초 등록·재발급 응답에서 한 번만 반환되고 DB에는 저장되지 않는다.
- 카드 응답을 잃으면 기존 카드를 조회할 수 없으므로 교사가 재발급한다.
- 학생 카드 재발급은 `sessionVersion`을 올려 기존 로그인 세션도 즉시 읽기 권한을 잃게 한다.
- 재시도 명령은 작업 종류·요청자·정규화한 입력의 fingerprint가 같을 때만 같은 `requestId`를 인정한다. 다른 입력 또는 다른 명령으로 재사용하면 `already-exists`다.
- 업무 재시도에는 같은 `requestId`를 사용한다. App Check 토큰은 요구하지 않는다.

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

## D1 추가 함수

모두 `asia-northeast3`의 Callable Function이다. 아래 추가 함수는 로컬 코드와 Emulator에서 구현·검증했고 Firebase 개발 프로젝트 `manito-938cc`에 배포했다. 개발 클라우드에서 웹 Custom Token 전체 흐름은 아직 검증하지 않았다.

| 함수 | 요청 | 응답 | 권한·오류 |
|---|---|---|---|
| `getTeacherStatus` | `null` | `{ status: "pending" \| "verified" \| "suspended", displayName }` | 로그인한 비학생만 조회. Claims와 교사 문서가 모두 확인돼야 `verified` |
| `listClasses` | `null` | `{ classes: [{ classId, name, schoolYear, gradeBand, memberCount }] }` | 확인된 교사만 담당 활성 학급 조회 |
| `getClassAccessInfo` | `{ classId }` | `{ classId, classCode, name, schoolYear, gradeBand, memberCount }` | 담당 교사만 학급 코드를 재조회. 다른 학급은 `permission-denied` |
| `getStudentHome` | `null` | `{ displayName, className, round: null \| { title, status, targetDisplayName } }` | 학생 본인 토큰·세션 버전·소속 확인. 회차 없으면 `round: null`; 다른 명부 없음 |
| `setStudentAccess` | `{ classId, studentUid, status: "active" \| "blocked", requestId }` | `{ studentUid, status }` | 담당 교사만 변경, 세션 버전 증가, 감사 기록. 같은 요청 재시도는 동일 결과 |

`scripts/manage-teacher.mjs`는 Callable이 아닌 신뢰된 관리자 실행 환경의 도구다. ADC의 Firebase Auth·Firestore 관리 권한이 있는 운영자만 사용한다. `--project=manito-938cc --uid=... --status=verified|suspended --operator=...`를 명시한다. 승인 시 교사 문서를 `pending`으로 먼저 두고 Claims를 설정한 뒤 `verified`로 바꾼다. 중지는 문서를 먼저 `suspended`로 바꾼다. 중간 실패는 접근 거절 상태로 남으며 같은 명령을 재실행해 복구할 수 있다. 실행 감사 기록은 `operatorAuditLogs`에 남긴다. 실제 학생 데이터 도입 전 관리자 식별·권한 운영 절차를 확정한다.

## D2~D5 회차·활동 API (2026-09-27 로컬 구현)

아래 함수는 로컬 코드와 `demo-manitto` 에뮬레이터의 가상 학급 두 회차에서 검증하고 개발 Firebase `manito-938cc`에 배포했다. 클라우드 로그인 전체 흐름 검증은 별도다. 모든 교사용 함수는 확인된 교사와 담당 학급을 검사한다. 학생용 함수는 Custom Token의 `classId`, `memberId`, `sessionVersion`, 활성 참여와 회차 상태를 검사한다.

| 함수 | 주요 입력 | 반환·상태 제한 |
|---|---|---|
| `listRounds` | `{classId}` | 회차 목록과 명부. 담당 교사만 |
| `getRoundSettingsForTeacher` | `{classId,roundId}` | 참가 UID·제외 관계·미션·수업일. 감사 기록 |
| `createRound` | `{classId,title,startsAt,endsAt,activityDates,participantIds,excludedPairs,allowFreeTextMessages,missionIds,requestId}` | `{roundId}`. 4~40명, 5/10일, 기간 30일 이내, 명단 활성 상태 |
| `updateRound` | 위 필드와 `roundId` | 초안·준비 완료 상태만 수정, `rosterVersion` 증가·준비 상태 해제 |
| `prepareRound` | `{classId,roundId}` | 배정 가능성·참가 상태·미션 검증 뒤 `{status:"ready",rosterVersion}` |
| `startRound` | `{classId,roundId,rosterVersion,requestId}` | 학급 잠금과 배정 전체를 단일 트랜잭션으로 확정. 활성 회차 중복 시작 거절 |
| `changeRoundStatus` | `{classId,roundId,action,requestId}` | `pause`, `resume`, `end`, `cancel`, `archive` 전이. `resume`은 종료 전만 |
| `stopRoundParticipation` | `{classId,roundId,studentUid,requestId}` | 학생 제출·공개 차단, 감사 기록 |
| `getAssignmentsForTeacher` | `{classId,roundId}` | 안전 대응용 전체 관계. 매 열람 감사 |
| `getMissionCatalog` | `{gradeBand}` | 해당 학년군에서 검토된 미션 10개 |
| `getStudentActivity` | `null` | 본인 미션·받은 쪽지·보낸 쪽지 상태·도움 요청 상태 |
| `setMissionStatus` | `{missionId,status:"done"\|"skipped"}` | 진행 중 회차에서 본인 미션 변경 |
| `replaceMission` | `{missionId,requestId}` | 같은 학년군의 미사용 미션으로 교체, 연속 2회 한도 |
| `sendMessage` | `{kind:"preset"\|"free",text,requestId}` | 서버 배정 수신자에게만. 한국 날짜 수업일 합계 1건. 자유형은 대기 |
| `reviewMessage` | `{classId,roundId,messageId,decision:"approve"\|"reject",requestId}` | 활성 양쪽 참가자만 전달, 감사 기록 |
| `hideMessage` | `{messageId}` | 수신자 본인 쪽지 숨김 |
| `createHelpRequest` | `{category,note?,messageId?,requestId}` | 본인 도움 요청. `messageId`는 본인 수신함 항목만 |
| `resolveHelpRequest` | `{classId,roundId,helpId,resolution,requestId}` | 교사 처리, 감사 기록 |
| `getTeacherRoundOverview` | `{classId,roundId}` | 도움 요청 → 대기 쪽지 → 참가 상태 → 일정. 감사 기록 |
| `revealRound` | `{classId,roundId,requestId}` | 공개 대기·미처리 도움/쪽지 0건일 때 활성 관계만 공개 |
| `sendThankYou` | `{text,requestId}` | 공개 후 준비된 감사 문구 1건 |
| `saveReflection` | `{text}` | 공개 후 본인 돌아보기 최대 300자 |
| `copyRoundSettings` | `{classId,sourceRoundId,title,startsAt,endsAt,requestId}` | 종료 회차에서 설정만 새 초안으로 복사. 새 수업일 확인·저장 필요 |
| `deleteClassData` | `{classId,requestId}` | 모든 회차 종료 후 학급 소유 교사만. 재시도 가능한 삭제 작업으로 학급 하위 문서, 카드 자격, 코드 조회, 학생 Auth 계정을 삭제 |

`excludedPairs` 요청은 `[[studentUid,studentUid], ...]`, 저장값은 Firestore 중첩 배열 제한에 맞춘 `[{a,b}, ...]`다. `missionIds`는 비워 기본 3개를 사용하거나 서로 다른 3개를 고른다. 학생에게 내려주는 쪽지에는 발신 UID와 원본 작성 시각을 넣지 않는다. `failed-precondition`은 회차 상태·수업일·일일 한도·제외 조건·미처리 안전 사안에 사용하고, 소속·세션·교사 권한 위반은 `permission-denied`다.

실제 학생의 권리 요청 접수와 보존·백업 처리 절차는 운영 정책 확정 전이다. `deleteClassData`는 학급 전체 삭제를 검증하는 개발 기능이며 실제 학생 운영에 대한 법적 준비 완료를 뜻하지 않는다.
