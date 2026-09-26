# Firestore 데이터 계약 v0.1

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
    assignmentSecrets/{studentUid}      # 서버 전용
    messageSecrets/{messageId}          # 서버 전용
  pairHistory/{giverUid_receiverUid}    # 서버 전용
  auditLogs/{logId}
studentCredentials/{studentUid}         # 서버 전용
studentCredentialLookups/{lookupDigest} # 서버 전용
classCodes/{classCode}                   # 서버 전용
teacherCommands/{teacherUid_requestId}  # 서버 전용
missionCatalog/{missionId}
```

## 문서별 책임

| 경로 | 책임 | 학생 직접 읽기 | 교사 직접 읽기 | 직접 쓰기 |
|---|---|---:|---:|---:|
| `teachers/{uid}` | 교사 프로필·확인 상태 | 아니요 | 본인만 | 아니요 |
| `classes/{classId}` | 학급·학년도·담당 교사·진행 회차 잠금 | 아니요 | 담당 교사 | 아니요 |
| `members/{studentUid}` | 표시 이름·접근 상태·세션 버전 | 본인 | 담당 교사 | 아니요 |
| `rounds/{roundId}` | 회차 일정·상태·메시지 정책 | 참가 회차 | 담당 교사 | 아니요 |
| `participants/{studentUid}` | 확정 명단과 중도 중단 상태 | 본인 | 담당 교사 | 아니요 |
| `studentData/{studentUid}` | 본인에게 공개할 상대·공개 결과 | 본인 | 담당 교사 | 아니요 |
| `missions` | 미션 내용 스냅샷과 상태 | 본인 | 담당 교사 | 아니요 |
| `inboxItems` | 승인되어 수신자에게 보여줄 쪽지 | 본인 | 담당 교사 | 아니요 |
| `sentMessages` | 발신자에게 보여줄 검토·전달 상태 | 본인 | 담당 교사 | 아니요 |
| `helpRequests` | 도움 요청과 교사 처리 상태 | 본인 | 담당 교사 | 아니요 |
| `assignmentSecrets` | 전체 방향 관계 | 아니요 | 함수로 감사 후 열람 | 서버만 |
| `messageSecrets` | 원문·발신자·수신자·검토 정보 | 아니요 | 함수로 감사 후 열람 | 서버만 |
| `pairHistory` | 과거 방향별 배정 횟수 | 아니요 | 아니요 | 서버만 |
| `studentCredentials` | 로그인 코드 검증·잠금 | 아니요 | 아니요 | 서버만 |
| `studentCredentialLookups` | 카드 로그인 ID를 학생 UID로 연결 | 아니요 | 아니요 | 서버만 |
| `classCodes` | 8자리 학급 코드를 학급 ID로 연결 | 아니요 | 아니요 | 서버만 |
| `teacherCommands` | 학급 생성 명령의 중복 실행 방지 | 아니요 | 아니요 | 서버만 |
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
8. 모든 재시도 가능한 명령은 `requestId`를 받아 동일 요청이 중복 문서를 만들지 않게 한다.

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

1. 실제 Firebase 프로젝트를 만들 때 Firestore 위치를 확정한다. 계획상 초기 후보는 서울 `asia-northeast3`이다.
2. `.firebaserc`의 `demo-manitto`는 에뮬레이터 전용이다. 실제 프로젝트 별칭을 따로 추가한다.
3. Security Rules 테스트와 Functions 권한 테스트를 모두 통과시킨다.
4. 개발·검증·운영 프로젝트를 분리하고 운영 데이터로 로컬 테스트하지 않는다.
5. 실제 학생 데이터를 넣기 전에 개인정보 처리 근거·동의·보관·삭제 절차를 확정한다.
