# Firestore 데이터 계약 v0.2

이 문서는 [서비스 개발 계획서](./manitto-development-plan.md)의 논리 모델을 실제 Firestore 경로와 권한 경계로 구체화한다. 첫 구현 단계에서는 브라우저의 직접 쓰기를 모두 차단하고 Cloud Functions가 쓰기와 업무 규칙을 담당한다.

## 핵심 결정

- 학급은 여러 회차를 가진다. 지난 회차 문서를 초기화하거나 재사용하지 않는다.
- 학생 인증 UID와 `members` 문서 ID를 동일하게 사용한다.
- 학생이 읽는 데이터와 전체 관계를 담은 비밀 데이터를 다른 문서에 저장한다.
- 교사의 비밀 배정·쪽지 원문 열람도 Callable Function을 통과시켜 감사 기록을 남긴다.
- 학생의 Custom Token에는 `role`, `classId`, `memberId`, `sessionVersion`만 넣는다. 표시 이름이나 배정 정보는 넣지 않는다.
- 학급당 진행 회차는 `classes.activeRoundId`로 잠근다. 회차 시작 트랜잭션이 이 필드와 배정 전체를 함께 확정한다.

## 경로 구조

```text
teachers/{teacherUid}
classes/{classId}
  members/{studentUid}
  rounds/{roundId}
    participants/{studentUid}
    studentData/{studentUid}
      missions/{missionInstanceId}
      inboxItems/{messageId}
      sentMessages/{messageId}
      helpRequests/{requestId}
      reflection/mine
    assignmentSecrets/{studentUid}      # 서버 전용
    messageSecrets/{messageId}          # 서버 전용
    helpSecrets/{helpId}                # 서버 전용
    messageDays/{studentUid_yyyy-mm-dd} # 서버 전용
    studentCommands/{studentUid_requestId} # 서버 전용
    thankYouSecrets/{studentUid}        # 서버 전용
  roundSettings/{roundId}               # 참가자·제외 관계·미션 선택, 서버 전용
  commands/{requestId}                  # 회차·학급 명령 중복 방지
  pairHistory/{encodedPairKey}           # 서버 전용
  auditLogs/{logId}
studentCredentials/{studentUid}         # 서버 전용
studentCredentialLookups/{lookupDigest} # 서버 전용
classCodes/{classCode}                   # 서버 전용
teacherCommands/{teacherUid_requestId}  # 서버 전용
operatorAuditLogs/{logId}                # 서버 전용
missionCatalog/{missionId}              # 예약 경로; 현재 카탈로그는 함수 코드에 내장
deletionJobs/{classId}                  # 삭제 재시도 상태, 서버 전용
```

## 문서별 책임

| 경로 | 책임 | 학생 직접 읽기 | 교사 직접 읽기 | 직접 쓰기 |
|---|---|---:|---:|---:|
| `teachers/{uid}` | 교사 프로필·확인 상태 | 아니요 | 본인만 | 아니요 |
| `classes/{classId}` | 학급·학년도·담당 교사·진행 회차 잠금 | 아니요 | 담당 교사 | 아니요 |
| `members/{studentUid}` | 표시 이름·접근 상태·세션 버전 | 본인 | 담당 교사 | 아니요 |
| `rounds/{roundId}` | 회차 일정·상태·메시지 정책 | 참가 회차 | 담당 교사 | 아니요 |
| `participants/{studentUid}` | 확정 명단과 중도 중단 상태 | 본인 | 담당 교사 | 아니요 |
| `studentData/{studentUid}` | 본인에게 공개할 상대·공개 결과 | 활성 참가자 본인 | 함수로 감사 후 조회 | 아니요 |
| `missions` | 미션 내용 스냅샷과 상태 | 활성 참가자 본인 | 함수로 조회 | 아니요 |
| `inboxItems` | 승인되어 수신자에게 보여줄 쪽지 | 활성 참가자 본인 | 함수로 조회 | 아니요 |
| `sentMessages` | 발신자에게 보여줄 검토·전달 상태 | 활성 참가자 본인 | 함수로 조회 | 아니요 |
| `helpRequests` | 도움 요청과 교사 처리 상태 | 활성 참가자 본인 | 함수로 감사 후 조회 | 아니요 |
| `roundSettings` | 참가자·제외 관계·미션 선택·명단 버전 | 아니요 | 함수로 감사 후 조회 | 서버만 |
| `helpSecrets`, `messageDays`, `studentCommands`, `thankYouSecrets` | 안전 원문·하루 한도·중복 명령·감사 전달 | 아니요 | 함수로 감사 후 조회 | 서버만 |
| `assignmentSecrets` | 전체 방향 관계 | 아니요 | 함수로 감사 후 열람 | 서버만 |
| `messageSecrets` | 원문·발신자·수신자·검토 정보 | 아니요 | 함수로 감사 후 열람 | 서버만 |
| `pairHistory` | 과거 방향별 배정 횟수 | 아니요 | 아니요 | 서버만 |
| `studentCredentials` | 로그인 코드 검증·잠금 | 아니요 | 아니요 | 서버만 |
| `studentCredentialLookups` | 카드 로그인 ID를 학생 UID로 연결 | 아니요 | 아니요 | 서버만 |
| `classCodes` | 8자리 학급 코드를 학급 ID로 연결 | 아니요 | 아니요 | 서버만 |
| `teacherCommands` | 학급 생성 명령의 중복 실행 방지 | 아니요 | 아니요 | 서버만 |
| `operatorAuditLogs` | 교사 승인·중지의 관리자 실행 기록 | 아니요 | 아니요 | 서버만 |
| `auditLogs` | 민감정보 열람·매칭·공개·삭제 기록 | 아니요 | 담당 교사 | 서버만 |

Firebase Admin SDK는 Security Rules를 우회한다. 따라서 ‘서버만’은 자동으로 안전하다는 뜻이 아니며 각 함수가 교사 소유권, 학생 소속, 접근 상태, 회차 상태와 요청 중복 여부를 다시 검사해야 한다.

## 주요 불변 조건

1. `classes.activeRoundId`는 없거나 정확히 한 회차를 가리킨다.
2. 진행 회차의 `rosterVersion`은 배정 문서 전체와 같다.
3. 참가 학생마다 `assignmentSecrets` 발신 1건이 있고 모든 수신 학생은 정확히 한 번 등장한다.
4. `studentData`에는 다른 관계의 UID나 전체 배정표를 넣지 않는다.
5. `inboxItems`에는 발신 UID와 정확한 원본 작성 시각을 넣지 않는다.
6. 로그인 카드 재발급·계정 차단 시 `members.sessionVersion`과 인증 클레임의 값이 달라져 기존 세션 읽기가 즉시 거절된다.
7. 회차 중단 학생과 연결된 대기 쪽지는 승인하지 않으며 정체 공개·감사 카드 대상에서도 제외한다.
8. 회차 시작·쪽지·검토·공개·설정 복사·삭제 등 재시도 가능한 명령은 `requestId`를 받아 동일 요청이 중복 문서를 만들지 않게 한다.
9. `teacherCommands`와 `classes/{classId}/commands`에는 명령 종류, 요청자, 입력 fingerprint를 기록한다. 재사용한 ID가 다른 입력 또는 작업을 뜻하면 거절한다. 등록 재시도 시 담당 학급 권한을 먼저 확인한다.
10. 교사 직접 읽기는 Claims의 `teacherVerified`와 `teachers/{uid}.verificationStatus == verified`가 모두 맞아야 한다. 교사 상태가 `suspended`면 직접 읽기와 함수 실행을 거절한다.

## 서버 명령의 트랜잭션 범위

| 명령 | 한 번에 확인·변경할 내용 |
|---|---|
| 회차 시작 | 교사 권한, `activeRoundId == null`, 명단 버전, 필수 배정 조건, 배정 전체, 학생별 보기, 회차 상태, `activeRoundId` |
| 미션 상태 변경 | 학생·회차 상태, 현재 미션 버전, `requestId`, 상태·변경 시각 |
| 쪽지 접수 | 학생·회차 상태, 활성 배정, 일일 한도, `requestId`, 비밀 원문, 발신 상태 |
| 쪽지 승인 | 교사 권한, 회차 상태, 양쪽 학생 참여 상태, 검토 상태, 수신함 생성, 감사 기록 |
| 정체 공개 | 교사 권한, 안전 보류 여부, 회차 상태, 학생별 공개 보기, 공개 시각 |
| 카드 재발급 | 교사 권한, 코드 해시 교체, 실패 횟수 초기화, `sessionVersion` 증가, 감사 기록 |

## 배포 전 체크

1. 개발 프로젝트 `manito-938cc`는 서울 `asia-northeast3`에 생성·배포했다. 별도 운영 프로젝트 생성 시 위치를 확정한다.
2. `.firebaserc`의 `demo-manitto`는 에뮬레이터 전용, `dev`는 개발 프로젝트 `manito-938cc`다. 명령 실행 시 대상을 명시한다.
3. Security Rules 테스트와 Functions 권한 테스트를 모두 통과시킨다.
4. 개발·검증·운영 프로젝트를 분리하고 운영 데이터로 로컬 테스트하지 않는다.
5. 실제 학생 데이터를 넣기 전에 개인정보 처리 근거·동의·보관·삭제 절차를 확정한다.

## 현재 구현과 남은 운영 조건

회차·미션·쪽지·도움·공개·설정 복사와 학급 삭제 경로를 로컬에 구현했다. 교사는 학생 개인 데이터를 직접 읽지 않고 감사 기록을 남기는 함수로 안전 현황과 배정을 조회한다. 배정은 `assignmentSecrets`, 제외 관계는 `roundSettings`에만 저장한다. `roundSettings.excludedPairs`는 Firestore의 중첩 배열 제한 때문에 `{a,b}` 객체 배열이다. 실제 학생 활성화에는 개인정보 처리 근거, 학교·보호자 안내, 보존 기간과 권리 요청 운영 절차의 확정이 남아 있다.
