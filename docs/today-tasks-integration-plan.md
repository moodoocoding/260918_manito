# ‘오늘 할 일’ Schooldoc 연동 개발 계획

작성일: 2026-10-30

보완: 사용자가 제공한 GitHub 저장소의 `main`과 로컬 조사본 대조(2026-10-30)

단계: 조사 및 사전 설계 계획. 기능 구현·실서비스 호출·제출·배포는 하지 않았다.

후속 상태: 2026-10-30 로컬 구현·자동 연결과 실제 연동 검증을 추가했다. 아래1~12절은 조사 당시의 계획과 한계이며, 구현은13절, 자동 연결은14절, 실제 카드/Schooldoc 왕복 검증은15절을 따른다.

## 1. 요청과 결론

현재 우리 반 월드의 ‘오늘 할 일’ 장소는 `https://schooldoc-nine.vercel.app/s/missions/b98b324f-fedf-4f70-b259-e048159f69e5`로 같은 탭 이동한다. 목적지에서 마을로 돌아오려면 브라우저 뒤로가기에 의존한다. 사용자는 Schooldoc 기존 페이지를 유지하면서 마니또 도트 월드 안에 별도 화면을 만들고, 기존과 같은 학생·미션·완료 상태를 전달하는 방안을 우선 요청했다.

**권장안은 마니또 웹에 학생용 오늘 할 일 화면을 추가하고, Schooldoc의 기존 공개 함수 `class-missions-public`에 현재와 같은 입력·응답 의미로 요청하는 것이다.** Schooldoc의 `/s/missions/:token` 페이지와 서버·데이터는 수정하지 않는다. 월드의 페이지 이동 구조를 활용하면 명시적인 ‘마을로 돌아가기’ 동작과 기존 캐릭터 위치 복귀를 제공할 수 있다.

소스 코드상 이 방식은 구현 가능하다. 사용자가 제공한 GitHub `main`의 핵심 7개 파일이 로컬 조사본과 동일하고, 공개 함수의 JWT 검증을 끄는 설정도 확인했다. 다만 실제로 호출할 Schooldoc 함수 URL, 운영 배포 버전과 CORS 응답, 가상 계정의 저장 결과는 확인하지 않았다. 따라서 **UI 재구현과 기존 API 재사용은 소스에서 확인했으며, 운영 연결은 환경 설정과 가상 데이터 검증을 남겨 둔 상태**다.

## 2. 현재 구성과 확인 근거

### 우리 반 월드

- `web/src/StudentClassroom.tsx`가 현재 ‘오늘 할 일’ 목적지 URL을 보유한다. 다른 마을 기능은 `onNavigate(page)`로 학생 앱 안의 화면을 연다. 오늘 할 일만 `window.location.assign()`으로 외부 페이지로 이동한다.
- `web/src/main.tsx`는 학생 화면 경로를 `/student`와 `/student/:page`로 관리한다. 마을 캐릭터 위치는 `studentWorldPosition` 메모리 ref에 유지하고, 로그아웃/학생 세션 정리 때 기본 위치로 초기화한다. 내부 화면에서 홈으로 돌아오면 이 값으로 월드를 다시 그릴 수 있다.
- 현재 인증은 Firebase 학생 Custom Token이며 `studentLogin()`으로 로그인한다. 학생 카드는 교사가 발급한다. 공용기기에서 세션, 화면 상태, 구독과 비밀 상태를 정리해야 하며 영구 Firestore 오프라인 캐시를 사용하지 않는 것이 저장소 정책이다.
- 이번 작업 직전의 코드 변경에는 월드 위치·내부 라우트·외부 링크가 이미 반영되어 있다. 현재 작업 트리에 여러 진행 중 변경이 있으므로 계획서 외의 코드는 수정하지 않았다.

### Schooldoc 공개 미션

읽기 전용으로 Schooldoc 저장소의 `AGENTS.md`, `src/App.tsx`, `src/features/classMissions/PublicClassMissionsPage.tsx`, `src/features/classMissions/missionApi.ts`, `supabase/functions/class-missions-public/index.ts`, `supabase/functions/_shared/classMissions.ts`, `supabase/functions/_shared/classMissionsServer.ts`, 관련 migration과 테스트를 확인했다. `.env` 파일, 키, 실제 배포 데이터·학생 응답은 읽거나 요청하지 않았다.

### GitHub 원본 대조

사용자가 제공한 원본은 [moodoocoding/schooldoc](https://github.com/moodoocoding/schooldoc)이다. GitHub 연결 도구로 기본 브랜치가 `main`임을 확인하고, 조사 시점의 [커밋 `d12665f`](https://github.com/moodoocoding/schooldoc/commit/d12665fbda7f3e871abf529bc17cb3099b8052a5)에 고정해 아래 파일을 읽었다. 각 원격 파일의 Git blob SHA와 로컬 파일의 `git hash-object` 결과가 모두 일치했다. 로컬 checkout의 HEAD는 다른 커밋이지만, 이 계획의 핵심 계약 근거 7개 파일은 GitHub `main`과 같다.

| 확인 대상 | 고정된 원본 링크 | 로컬과 비교 |
|---|---|---|
| 라우트 | [src/App.tsx](https://github.com/moodoocoding/schooldoc/blob/d12665fbda7f3e871abf529bc17cb3099b8052a5/src/App.tsx) | 동일 |
| 학생 화면 | [PublicClassMissionsPage.tsx](https://github.com/moodoocoding/schooldoc/blob/d12665fbda7f3e871abf529bc17cb3099b8052a5/src/features/classMissions/PublicClassMissionsPage.tsx) | 동일 |
| 조회·제출 client | [missionApi.ts](https://github.com/moodoocoding/schooldoc/blob/d12665fbda7f3e871abf529bc17cb3099b8052a5/src/features/classMissions/missionApi.ts) | 동일 |
| 공개 함수 진입 | [class-missions-public/index.ts](https://github.com/moodoocoding/schooldoc/blob/d12665fbda7f3e871abf529bc17cb3099b8052a5/supabase/functions/class-missions-public/index.ts) | 동일 |
| 입력·응답·상태 규칙 | [classMissions.ts](https://github.com/moodoocoding/schooldoc/blob/d12665fbda7f3e871abf529bc17cb3099b8052a5/supabase/functions/_shared/classMissions.ts) | 동일 |
| 서버 검증·저장·CORS | [classMissionsServer.ts](https://github.com/moodoocoding/schooldoc/blob/d12665fbda7f3e871abf529bc17cb3099b8052a5/supabase/functions/_shared/classMissionsServer.ts) | 동일 |
| 함수 JWT 배포 설정 | [supabase/config.toml](https://github.com/moodoocoding/schooldoc/blob/d12665fbda7f3e871abf529bc17cb3099b8052a5/supabase/config.toml) | 동일 |

GitHub `main`의 코드가 현재 Vercel 프런트와 Supabase 함수에 배포되었다는 뜻은 아니다. 운영 배포 커밋·함수 설정과 실제 호출 결과는 별도로 확인해야 한다.

### 확인한 계약

- 라우트는 `src/App.tsx`의 `/s/missions/:token`이고, 현재 화면은 `PublicClassMissionsPage`다.
- 학생 접속은 교사 로그인이나 Schooldoc 계정 세션이 아니라 공유 토큰과 학생 이름 또는 12자리 개인 코드로 이뤄진다. 개인 코드는 서버에서 학급 ID와 함께 해시를 확인한다. 이름이 중복이면 개인 코드를 요구한다.
- 프런트는 `supabase.functions.invoke('class-missions-public', { body })`를 사용한다. `viewPublicMission()`은 `{ action: 'view', token, studentName: trimmed, code: trimmed }`를 보내고, `markPublicMission()`은 여기에 `missionId`와 `status: 'reported' | 'unmarked'`를 더한다. 이름/코드를 각기 다른 값으로 전송하는 현재 계약이 아니라 현재 화면의 단일 입력을 두 필드에 똑같이 넣는 계약이다.
- 조회 응답 `PublicMissionView`는 `{ className, studentName, missions }`; 각 미션은 `{ id, title, description, startDate, dueDate, requiresConfirmation, status, check, checkedAt }`를 포함한다. 미션은 대상 학생에게 배정된 공개 미션만 내려온다. `status`는 `open | closed`, `check`는 `unmarked | reported | pending | confirmed | exempt`다.
- 제출 `reported`는 `requiresConfirmation`이 참이면 `pending`, 아니면 `reported`로 저장된다. `unmarked`는 학생이 직접 취소할 수 있는 `reported`/`pending`에만 허용되며, 교사 확인 `confirmed` 또는 해당 없음 `exempt`는 학생이 취소할 수 없다. 완료 제출은 미션 공개 상태와 한국 날짜의 시작·마감 범위도 검사한다.
- 서버는 토큰 활성화, 이름/코드와 학생 소속·대상 여부, 요청 상태를 다시 검사하고 IP·토큰·학생 단위 요청 제한을 둔다. 응답 헤더에 `Cache-Control: no-store`, `Referrer-Policy: no-referrer`가 정의되어 있다. 함수 CORS 허용 원점은 현재 소스에서 `*`다. DB의 `class_mission_boards`는 RLS로 클라이언트 직접 접근을 막으며, 이름·코드 해시·미션·완료 이력은 암호화 payload로 저장된다. 서버는 version 조건부 갱신을 최대 5회 재시도한다.
- `supabase/config.toml`의 `[functions.class-missions-public]`은 `verify_jwt = false`다. 공개 handler도 Firebase/Supabase 사용자 bearer를 검증하지 않고 공유 token과 이름/코드를 검증한다. 현재 웹 SDK가 사용하는 anon key 설정과 공개 함수 자체의 학생 자격 검증은 구분해야 한다. 직접 HTTP client에 anon key가 필수인지는 실제 배포 gateway 설정 확인 전 단정하지 않는다.
- 현재 공개 화면은 새로고침·나가기, 완료 표시·취소, 교사 확인 대기·확인됨, 시작 전·마감·종료·해당 없음 상태를 제공한다. 코드/이름과 로그인 상태는 컴포넌트 메모리에 있고 이 화면에서 localStorage에 저장하지 않는다. 기존 공개 페이지는 `class-missions.spec.ts`와 서버 단위 테스트에 관련 커버리지가 있다.

### 조사하지 않은 외부 조건

- 공개 URL의 현재 운영 응답이나 실제 학생별 미션 페이지를 호출하지 않았다. 지정 토큰이 어느 학급을 가리키는지와 현재 데이터·응답은 조회하지 않았다.
- Schooldoc의 실제 Supabase URL·anon key, 운영 빌드 설정·허용 원점 변경 이력은 확인하지 않았다. anon key는 클라이언트 공개값이지만 프로젝트 운영자가 제공·승인한 연결 설정이어야 한다.
- Schooldoc 앱 호스트의 실제 Vercel/CDN 응답 헤더, `Content-Security-Policy: frame-ancestors`, `X-Frame-Options`, 호스팅 측 프레임 정책은 확인하지 않았다. 저장소에서 해당 정책을 설정한 배포 구성을 발견하지 못했다는 사실만으로 iframe 허용 또는 차단을 결론내릴 수 없다.

## 3. 권장 화면·흐름

학생 월드 → ‘오늘 할 일’ 건물에 도착 → 상호작용 → 마니또 안의 오늘 할 일 화면. 상단 문맥에는 `오늘 할 일`과 `우리 반 월드로 돌아가기`를 두고, 화면 초점은 Schooldoc의 학생 접속 또는 오늘의 미션 목록에 둔다. 월드로 돌아가기는 브라우저 기록을 요구하지 않는 명시적 내부 이동이다.

제안 화면은 Schooldoc의 현재 과업 순서·레이블 의미·상태 전이를 따른다. Schooldoc의 파란 브랜드를 픽셀 월드의 숲·종이·나무 표면, 선명한 글자와 큰 조작 영역으로 재표현하되, 접속 자격 방식과 제출의 의미는 바꾸지 않는다.

1. **미접속:** 기존처럼 이름 입력과 개인 코드 입력 방식 전환, 개인 코드 사용 안내, `내 미션 보기`. 이름 입력은 중복 이름 오류 시 코드를 사용하도록 안내한다.
2. **조회 중:** 중복 제출을 막고 진행 상태를 알린다. 이름/코드를 지우기 전 제출 요청만 전송한다.
3. **접속 완료:** 학급명·접속된 학생명, 미션 요약, 진행 미션·완료 표시·지난/시작 전·해당 없음 그룹을 표시한다. 원문 미션 제목·설명은 본인 대상 응답만 쓴다.
4. **완료/취소:** 기존과 동일한 버튼 조건, 교사 확인 대기 여부, 오류 후 입력·현재 화면 보존과 재시도. 응답을 받기 전 성공으로 표시하지 않는다.
5. **마을 복귀:** `우리 반 월드로 돌아가기`를 누르면 `/student`로 이동한다. 기존 `studentWorldPosition` 메모리 값을 사용해 같은 위치에 캐릭터를 표시한다. 페이지 언마운트 시 이름/코드와 미션 응답 메모리를 비우며, 다시 들어오면 다시 접속한다.
6. **오류·종료:** 토큰이 비활성화되었거나 삭제·접근 거절된 경우 기존 함수의 안전한 오류 메시지를 유지하고 재접속 안내를 제공한다. 네트워크 오류는 민감 입력을 화면에 유지한 채 재시도 가능하게 하되, 백엔드가 이미 반영했을 수 있는 중복 클릭은 막고 조회 후 상태를 다시 확인한다.

학생 세션과 Schooldoc 미션 접속은 별개의 권한이다. Firebase Custom Token이나 마니또 세션 정보를 Schooldoc으로 보내지 않는다. Schooldoc의 기존 공유 token 및 이름/코드만 동일한 함수 계약으로 전송한다. 코드·이름·응답을 URL, Analytics, 오류·디버그 로그, 브라우저 영구 저장소, `postMessage` payload에 넣지 않는다. 화면 이탈·로그아웃·학생 전환·탭 숨김/세션 버전 무효화 때 외부 미션 상태와 대기 요청도 폐기한다. 보안상 이름/코드를 장기 보존하지 않는 대신 재진입 때 재접속하는 동작을 명확히 알린다.

## 4. 데이터·API 호환 계획

**원본 목적지의 의미를 유지하는 범위**는 동일한 `token`, 동일 입력값을 담은 `studentName`과 `code`, 동일한 `missionId`, `reported | unmarked`, 같은 서버 함수, 같은 응답을 사용한다는 뜻이다. 미션 필드나 서버 권한을 새로 만드는 것이 아니다.

권장 구현은 마니또에 `StudentTodayTasks.tsx`와 별도 `schooldocMissionsApi.ts`를 두고, 서버가 이미 제공하는 공개 엔드포인트에 POST하는 작은 API client를 만든다. 기존 Schooldoc 페이지의 코드를 직접 복사·수정하거나 Schooldoc 내부 모듈을 두 프로젝트가 공유한다고 가정하지 않는다. 요청/응답 계약은 이 계획의 표와 Schooldoc 공개 API 테스트에 맞춘 독립 타입으로 선언한다.

필요 설정은 환경별 Schooldoc 공개 함수 URL과 현재 고정되어 있는 공유 토큰이다. 기존 SDK와 같은 연결 방식을 쓰면 `VITE_SCHOOLDOC_SUPABASE_URL`, `VITE_SCHOOLDOC_SUPABASE_ANON_KEY` 같은 공개 설정을 사용할 수 있다. 직접 `fetch` 방식은 저장소의 `verify_jwt = false`와 공개 handler 계약을 근거로 최소 헤더부터 가상 환경에서 확인하고, 운영 gateway가 요구할 때 공개 anon key를 추가한다. anon key는 기존 클라이언트 공개값이지만 service-role key·암호화 키는 절대로 마니또에 넣지 않는다. Firebase SDK 인증 헤더나 교사 로그인 JWT를 외부에 전달하지 않는다. 이미 URL에 들어 있는 공유 토큰을 query string이나 로그로 추가 복사하지 않는다.

| 목적 | 요청 | 결과·의미 |
|---|---|---|
| 본인 미션 보기/새로고침 | `POST /functions/v1/class-missions-public`; `{ action: 'view', token, studentName: input.trim(), code: input.trim() }` | `{ className, studentName, missions[] }`; 토큰 활성, 이름 또는 코드 검증과 학생 대상 미션 조회 |
| 완료 표시 | 동일 함수; `{ action:'mark', token, studentName, code, missionId, status:'reported' }` | 동일한 최신 조회 모델; 서버가 교사 확인 설정에 따라 `reported`/`pending`으로 결정 |
| 완료 취소 | 동일 함수; status `'unmarked'` | 허용되는 이전 상태일 때 취소; `confirmed`/`exempt`는 서버 거절 |

호출 client는 Schooldoc과 같은 URL·응답·에러 의미를 보존한다. 응답 schema가 예상과 다르거나 설정이 없으면 기본 미션이라고 꾸며내지 않고 연결 오류로 멈춘다. HTTP/함수 오류 본문은 Schooldoc 함수가 반환하는 사용자 메시지만 제한적으로 읽고, 전송한 입력·응답 본문·토큰은 로그에 기록하지 않는다. submit 후 타임아웃/네트워크 단절은 불확실 상태를 보여 주고 재조회로 실제 저장 상태를 확인한다.

### 계약 동일성 검증

- Schooldoc 기존 테스트와 같은 가상 이름/코드·미션을 로컬 mock 함수에 사용해 `view`, `mark reported`, `mark unmarked` body와 반환 필드를 비교한다.
- Schooldoc API 스키마 타입을 대상으로 응답 파서의 필드/상태를 검증한다. 기존 endpoint에 없는 필드가 필요하다고 가정하지 않는다.
- 운영자 승인 후 별도의 가상 학급·가상 학생·가상 미션에서 실제 운영 함수의 응답과 동일한 요청을 비교한다. 실제 학생 명부나 응답은 읽거나 쓰지 않는다.
- 마니또 UI의 각 제출 결과가 기존 페이지와 같은 서버 상태를 만든다는 것을 가상 데이터의 양쪽 화면 조회로 확인한다. 기존 `/s/missions/:token` 구현을 바꾸지 않은 diff와 배포 버전 비교로 기존 페이지가 그대로임을 확인한다.
- 개발·검증 중에도 지정 공개 토큰을 재발급·비활성화하거나 실제 응답을 제출하지 않는다. 가상 test token/fixture를 사용할 수 없으면 운영 write 검증은 미실행으로 남기고, 읽기 전용 또는 mock 증거만으로 저장 동등성을 주장하지 않는다.

## 5. 대안 비교와 판단

| 방식 | 장점 | 제약·위험 | 결론 |
|---|---|---|---|
| **마니또 안에서 UI 재구현 + 기존 공개 API** | 픽셀 스타일·명시적 마을 복귀·위치 복원. Schooldoc 기존 페이지는 변경하지 않음. 같은 서버가 대상 검사·저장·확인을 담당 | 공개 API 주소·호출 설정과 cross-origin 호출 확인 필요. UI와 기존 페이지가 병행되므로 API 회귀 테스트·계약 추적 필요 | 사용자의 우선안. 설정 게이트 통과 뒤 권장 |
| iframe으로 기존 페이지 삽입 | 기존 Schooldoc UI와 저장 동작을 그대로 사용하고 부모 앱에 마을 복귀 버튼을 둘 수 있음 | 실제 `frame-ancestors`/`X-Frame-Options` 미확인. CSP가 차단하면 사용할 수 없음. cross-origin 내부 스타일·오류 UI·포커스는 수정할 수 없음. 모바일 중첩 스크롤·높이 관리가 불리함 | 헤더 정책 확인 전 가능/불가 단정 금지. 재구현 막힐 때만 조사 |
| 새 탭/팝업으로 기존 페이지 열기 | 기존 기능 변경이 없고 월드 탭을 열어 둠. parent/child 코드 결합 불필요 | 마을 탭으로 돌아오는 것은 가능하지만 탭 전환·팝업 차단에 기대며 도트 스타일과 화면 안 복귀를 해결하지 못함. 팝업은 어린 학생에게 탭 구분이 어려움 | 낮은 위험의 임시 대안. 같은 화면 흐름 요구는 부분 충족 |
| Schooldoc의 협력 브리지 (`postMessage` 또는 복귀 링크) | 앱 간 명시적 종료·결과 전달을 구현할 수 있음 | 현재 페이지는 bridge API/target-origin allowlist를 제공하지 않는다. 메시지 원본 확인·token/PII 제외·새 배포가 필요하고 사용자의 “기존 페이지 그대로” 요구와 어긋남 | 기존 페이지 변경 승인이 별도로 있을 때만 고려 |
| 새 화면이 DB를 직접 읽고 씀 | 별도 API 없이 연결하는 것처럼 보일 수 있음 | RLS가 anon/authenticated의 `class_mission_boards` 직접 접근을 막는다. payload 암호화와 검증을 우회·복제할 수 없어 권한·데이터 무결성 계약 위반 | 사용하지 않음 |

## 6. 단계별 구현 범위 및 영향

| 단계 | 작업 | 계획상 영향 파일/계약 | 통과 조건 |
|---|---|---|---|
| 0. 연결 설정 확인 | 공개 function URL, 운영 배포/토큰 상태, 실제 gateway와 CORS를 확인. 기존 SDK 방식을 사용할 경우 공개 anon key 설정을 확인 | 마니또 공개 환경 변수/예시 파일만 후보. service-role key는 사용하지 않음 | 환경 설정과 가상 데이터 호출 확인 후 연결 구현. API 미배포/차단이면 대안 재검토 |
| 1. 계약 고정 | 위 요청·응답·오류 상태를 독립 TypeScript 타입과 mock 기반 client로 기술 | 신규 `web/src/schooldocMissionsApi.ts`, 관련 단위 테스트 후보 | API 호출 body, 필드, 상태와 기존 Schooldoc 테스트가 일치 |
| 2. 사전 디자인 통과 | 월드 도트 UI, 세션 분리, 오류/복귀 플로우를 6개 관점에서 검토하고 P0/P1 없게 보완 | `docs/design-reviews/YYYY-MM-DD-today-tasks.md` | 6개 관점 통과 및 미해결 P0/P1 없음 |
| 3. 프런트 구현 | 별도 학생용 오늘 할 일 페이지, 내부 라우트, 건물 내비게이션, 명시적 월드 복귀, 이전 위치 유지 | 후보: `web/src/StudentTodayTasks.tsx`, `web/src/main.tsx`, `web/src/StudentClassroom.tsx`, `web/src/schooldocMissionsApi.ts`, `web/src/student-world.css`, `web/.env.example` | 기능·권한·저장 계약 변경 없이 API를 통해 동일 값 전달 |
| 4. 검증 | mock/test fixture, 로컬 화면, 승인받은 가상 운영 fixture만 사용 | 대상별 unit/E2E 테스트와 사후 디자인 기록 | 아래 검증 목록 충족, 기존 Schooldoc 페이지 diff 없음 |
| 5. 배포 준비 | 개발 환경에 먼저 설정·배포하고 승인·기능 확인 후 별도 생산 배포 계획 | Vercel/Firebase 대상은 기존 환경 분리 정책 준수. 배포는 별도 승인 범위 | 개발 확인과 운영 반영을 구분해 보고. 이 계획 자체는 배포 승인 아님 |

기존 `functions/`, `firestore.rules`, Firestore 스키마·API 문서 변경은 현재 필요하지 않다. 외부 endpoint가 표시·완료 상태를 제공하므로 이 데이터를 Firestore에 복사하거나 동기화하지 않는다. 기능별 코드 변경 전 6개 프로파일의 사전 설계를 마친다. 구현 후 실제 웹 브라우저에서 같은 6개 관점으로 재검토하고 결과를 기록한다.

## 7. 안전·세션·오류 처리

- Schooldoc API는 토큰이 공개되어 있다는 이유만으로 익명 학생 전체 접근을 허용하는 인터페이스가 아니다. 같은 기존 이름/개인 코드 인증과 IP·토큰·학생 rate limit를 유지한다. 서버 검증을 UI에서 대체하지 않는다.
- 현재 제공하는 값은 미션명·설명과 특정 학생의 완료 상태다. 모든 대상 학생, 전체 roster, 코드 해시, `encrypted_payload`를 가져오지 않는다. Full class roster를 API 응답 또는 DOM에 표시하지 않는다.
- 코드와 이름은 페이지 내 메모리 상태로만 둔다. 자동완성·브라우저 복원·URL query/hash·localStorage/sessionStorage/IndexedDB 저장을 하지 않는다. 기록/분석 도구에서 URL과 fetch body를 수집하지 않도록 한다.
- 브라우저가 외부 endpoint로 보내는 요청에는 Firebase 자격 정보를 넣지 않는다. gateway에서 요구하면 공개 anon key를 쓰고 service role이나 암호화 키는 클라이언트에 추가하지 않는다.
- 외부 API 호출 중 마니또 로그아웃/학생 전환/페이지 이탈이 발생하면 요청 결과를 UI에 적용하지 않도록 요청 generation/cancel 처리를 한다. 마니또 Custom Token 무효화와 Schooldoc 접속 종료는 서로 자동 연동되지 않으므로 화면 메모리를 즉시 삭제하고 새 진입을 막는다.
- 마을 복귀 버튼은 모든 상태에서 보여준다. 전송 중에는 중복 제출을 막되, 이탈을 차단하지 않는다. 실패 시 입력과 현재 상태를 보존하고 재시도/다시 조회를 제공한다. 공개 링크가 사용 중지된 경우는 토큰 오류 안내를 제공하며 이름·코드의 옳고 그름을 과도하게 구체화하지 않는다.
- 운영자 확인 없이 기존 공개 URL의 토큰을 다른 학급에 재사용하거나 회전하지 않는다. 재발급·차단·삭제·보유 기간은 Schooldoc의 교사 기능과 정책 범위에 남긴다.

## 8. 개발 단계에서 필요한 검증

아래는 구현 시 실행할 계획이며 아직 실행하지 않았다.

### 계약·저장

- 실제 요청 body가 현재 Schooldoc `viewPublicMission()`/`markPublicMission()`과 의미상 일치하고 앱 자체에서 다른 recipient ID나 미션 대상을 결정하지 않는지 검증.
- 성공·거절·요청 제한·오프라인·서버 지연·낙관적 갱신 충돌에서 로딩·오류·재조회 흐름 검증.
- `requiresConfirmation` false/true, reported/pending cancel, confirmed/exempt, 시작 전·마감 후·종료, 대상 아님, 토큰 비활성, 중복 이름, 개인 코드 모두를 가상 fixture로 검증.
- 2회 요청/더블 클릭 시 서버에서 실제 추가 완료 이벤트가 생기지 않도록 기존 함수의 중복 의미를 유지. 시간 초과 후 무조건 재전송하지 말고 먼저 재조회.
- 기존 Schooldoc `/s/missions/:token` DOM·요청·저장 동작에 변경이 없음을 비교. Schooldoc 테스트를 실행하더라도 로컬 mock/fixture에 한정하고 remote integration은 실행하지 않음.

### 화면·입력

- 데스크톱 1280px, 태블릿 768px, 모바일 390px/360px와 320 CSS px 좁은 폭 및 200% 확대. 미션 1개·빈 상태·최대 60개·100자 제목·1000자 설명·긴 학급/학생 이름, 오류문과 오래된 완료기록.
- Tab/Shift+Tab/Enter/Space, 포커스 가시성·페이지 진입 시 제목 또는 접속 입력 포커스, 복귀 버튼 후 월드 초점·스크롤 복원, `prefers-reduced-motion`.
- 로딩/접속/완료/취소/교사 확인 대기/오류를 색상뿐 아니라 텍스트와 아이콘으로 구별. 모바일에서 접속 CTA와 복귀 버튼을 찾을 수 있고 화면 폭에 맞게 자연스럽게 세로 스크롤.
- 사용자 가상 정보만 사용. 접근성 자동검사나 빌드만으로 화면 검증 완료를 주장하지 않음. 실제 교사·학생 이해도와 실기기 터치는 별도 수행 전까지 미확인.

## 9. 롤백 계획

변경은 클라이언트 화면과 읽기 전용 API 호출로 한정하고 Schooldoc 페이지·스키마·서버를 수정하지 않는다. 문제가 생기면 월드 건물의 `onNavigate` 대신 기존 외부 URL 이동을 되돌리고 신규 페이지/API client/environment wiring을 제거한다. 이미 서버에 정상 제출된 기존 완료 표시를 롤백 이유로 삭제하거나 덮어쓰지 않는다. 새 화면이 보내는 중복/오류 제출이 확인되면 먼저 연결을 비활성화하고 Schooldoc의 기존 공개 페이지를 안내한다. 운영 token rotate나 실제 응답 파기는 롤백 수단으로 사용하지 않는다.

## 10. 6개 가상 전문가 관점의 사전 설계 검토

이 검토는 Codex 한 에이전트가 여섯 개 프로파일을 각각 적용한 문서 단계의 역할 기반 검토다. 외부 전문가·교사·학생의 참여나 승인, 실제 브라우저 검증은 없다. 입력은 사용자 요청, 월드 화면·라우팅·스타일 코드, Schooldoc 미션 페이지·API·서버 검증 코드·테스트와 저장소 지침이다.

| 프로파일 | 개별 판단과 근거 | 문제 → 근거 → 사용자 영향 → 수정안 → 확인 방법 | 판정 |
|---|---|---|---|
| WD-01 · 시각 구성과 브랜드 | 오늘 할 일도 다른 장소 내부 화면과 같은 도트 월드의 표면 계층을 따라야 한다. 실제 미션 목록은 본문 주 초점이며 복귀는 반복되는 보조 탐색이어야 한다. | 단순 외부 페이지는 색·레이아웃·브랜드가 전환되어 흐름이 끊긴다 → H4/H8, 표면 계층 → 목적지에서 마을 경험을 잃는다 → 월드 팔레트·픽셀 경계·한 곳의 주 CTA를 사용하고 미션/상태 카드와 header를 분리 → 전체 화면 캡처와 1초 초점 확인 | 통과(설계안) |
| WD-02 · 반응형·타이포그래피 | Schooldoc 데이터는 1~60개 미션, 100자 제목과 1000자 설명일 수 있으므로 도트 테마가 내용 가독성을 누르면 안 된다. 좁은 화면은 1열을 기본으로 한다. | 긴 내용/최대 목록에서 카드가 잘릴 수 있음 → 콘텐츠 중심 반응형·H8 → 학생이 미션 의미나 제출 버튼을 놓침 → 제목·설명 줄바꿈, 세로 목록, 상태별 구분, 모바일 상단 높이 제한 → 360/390/768/1280px·320px·200% 확대 및 최대 fixture 확인 | 통과(검증 전제) |
| UX-01 · 정보 구조와 과업 흐름 | 별도 `/student/today-tasks` 내부 경로와 상시 복귀 액션은 브라우저 기록 없이 월드로 돌아가게 한다. 현재 캐릭터 좌표 ref는 홈 재진입에 활용 가능하다. | 외부 이탈 후 돌아가기 방법을 기억해야 함 → H3/H6 → 길을 잃고 과업이 끊김 → 명시적인 `우리 반 월드로 돌아가기`, 페이지 메모리 정리 후 명확한 재접속 → 진입·완료·취소·오류·로그아웃 복귀 시나리오 확인 | 통과(설계안) |
| UX-02 · 인지 부담·사용자 이해 | 이름과 개인 코드는 현재 서비스가 제공하는 로그인 방법이며 접속 대상을 바꾸지 않는다. 완료/교사 확인 의미를 유지하고 학생 대상 언어로 설명한다. | 두 서비스 계정이 합쳐진다고 오해할 수 있음 → H2/H5 → 입력 자격·결과에 혼란 → 학교 미션 접속은 별도임을 짧게 안내하고 기존 이름/개인 코드 용어를 보존 → 가상 1~2학년 워크스루 및 오입력·동명이인·비활성 링크 확인 | 통과(내용·사용성 시험 전제) |
| UI-01 · 조작·상태 | `view`/`mark` 호출이 완료된 응답을 받아야 완료 상태로 표시한다. `reported`, `pending`, `confirmed`와 취소 가능성을 분리하고 이탈 버튼은 처리 중에도 명시한다. | 응답 지연·더블 클릭이 저장 완료로 오해될 수 있음 → H1/H5/H9 → 중복/상태 불일치 → 단일 진행 잠금, 필드별 오류, 시간 초과 시 재조회, 이전 상태 제한은 서버와 동일하게 표현 → 모의 지연·실패·충돌·빠른 반복 입력 테스트 | 통과(계약 확인 후) |
| UI-02 · 접근성·화면 품질 | 네이티브 폼과 버튼, 연결된 label, 보이는 focus, 텍스트 상태, 높은 대비, 48px 목표를 계획에 요구한다. iframe은 화면 읽기·초점 제어가 외부 정책과 cross-origin에 달려 있다. | 실제 배포의 CORS/프레임 응답 헤더와 공개 API 설정을 확인하지 못함 → H1/H3 및 실패 복구 필요 → 브라우저에서 진입 또는 복귀가 차단될 수 있음 → iframe 의존 없이 내부 UI/API 호출을 우선하되 환경 설정 검증 전 구현을 보류 → 브라우저 네트워크/CORS·키보드·화면 읽기 검사 | 근거 부족: 연결 설정 게이트 |

### 사전 판정과 미해결 게이트

제안 UI와 사용 흐름 자체는 진행 가능한 설계안이다. GitHub 원본 대조로 공개 함수의 계약과 JWT 설정을 보완했지만 실제 endpoint와 배포 CORS, 가상 검증 대상은 미확정이다. **실제 연결 코드는 환경 설정을 확인하고 UI-02의 근거 부족 항목을 재판정한 뒤 착수**한다. 오프라인 화면 설계와 mock 기반 계약 준비는 이 외부 설정과 독립적으로 진행할 수 있다. 전문가 의견 외 미확인 사항은 아래 11절과 같다.

## 11. 구현 전 추가 확인이 필요한 내용

1. Schooldoc 공개 함수 URL과 endpoint 현재 운영 여부/배포 버전. 기존 SDK와 동일한 연결 방식을 채택하면 공개 anon key도 필요하며, 직접 HTTP 방식의 필수 헤더는 배포 gateway와 가상 환경에서 확인한다. 민감한 키는 받거나 저장하지 않는다.
2. 마니또 Vercel 개발·운영에서 Schooldoc 공개 함수로 나가는 CORS/preflight 성공 여부와 브라우저 CSP/network 결과. 현재 코드의 `*` 설정이 실제 배포에서 그대로인지 확인.
3. 지정 토큰이 특정 실학급 URL인지, 사용자가 실제 학생 데이터 연결을 의도하는지. 실제 사용 전에는 이 저장소 정책의 개인정보 처리 근거·학교/보호자 안내·보존·삭제·문의처 조건을 먼저 충족해야 한다. 승인 전에는 가상 token/fixture를 사용.
4. 실제 서비스 호출을 검증할 별도 가상 Schooldoc 학급/학생/미션 생성과 정리 권한. 이를 제공할 수 없으면 public read-only 계약과 mock 확인까지만 완료로 표시하고, 저장 결과 동일성은 미확인.
5. 기존 페이지가 1개 로그인 세션 내 같은 이름/코드로 여러 번 조회하는 관행이 있는지, 공개 미션 함수의 현재 rate limit·오류 메시지가 기존 UX와 유지되는지. 비밀 설정을 읽지 않고 운영 담당자 확인 또는 가상 fixture로 검증.
6. 실제 배포 응답의 `X-Frame-Options` 및 CSP `frame-ancestors`는 iframe 대안을 택할 때에만 확인한다. 페이지 HTML이나 학생 응답을 조사에 사용할 필요는 없다.

## 12. 작업 범위 및 완료 상태

- 이번 작업에서 새로 작성하는 파일: `docs/today-tasks-integration-plan.md` 하나.
- 수정하지 않은 범위: Schooldoc 저장소, 마니또 서비스 코드·`main.tsx`·미리보기·함수·Rules·`docs/work-log.md`, 실제 데이터·토큰 상태, Firebase/Supabase/Vercel 설정과 배포.
- 이번 조사에서 실행하지 않은 것: 실제 공개 URL 페이지 열기, API 호출/제출/테스트, 브라우저 반응형/키보드 검증, 빌드, CORS·프레임 정책의 실 운영 확인.
- 따라서 이 문서는 구현 완료·연동 확인·전문가의 외부 승인·개인정보 처리 준비 완료를 의미하지 않는다. 다음 구현 전에 6절의 연결 설정 확인과 11절의 실 데이터 방지 조건을 해결해야 한다.

## 13. 2026-10-30 로컬 구현 결과

사용자의 이미지 시안 진행 요청에 따라 내부 페이지 `/student/today-tasks`를 구현했다. 월드 학교의 외부 이동을 내부 내비게이션으로 바꾸고 기존 위치 ref를 재사용한다. `StudentTodayTasks.tsx`·`student-today-tasks.css`는 글자 없는 도트 교실 배경 위에 실제 HTML 폼·미션·완료/취소·확인 대기·새로고침·복귀·도움·종료를 그린다. Schooldoc 화면/서버/DB는 수정하지 않았다.

공개 배포 웹 번들에서 비밀값을 출력하지 않고 공개 Supabase origin을 확인했다. 연결 주소는 `https://jhystopaacyfvjxhnpyd.supabase.co/functions/v1/class-missions-public`이고 기존 공유 토큰을 그대로 쓴다. OPTIONS 200과 토큰/학생 없는 POST 400에서 CORS `*`, `content-type` 허용, `no-store` 및 JWT 없는 handler 진입을 확인했다. 이에 따라 anon key 없이 공개 함수에 직접 POST하는 client를 구현했다. 유효한 토큰/이름을 조합한 학생 조회나 완료 제출은 실행하지 않았다.

`schooldocMissionsApi.ts`는 기존 body·상태 의미를 유지하고 응답을 공개 필드만으로 검증한다. 잘못된 주소로의 신원 전송을 막고 쿠키·Firebase 토큰·referrer·영구 캐시를 전달하지 않는다. `schooldocMissionsConfig.ts`는 공개 기본값과 선택적인 `VITE_SCHOOLDOC_MISSIONS_API_URL`/`VITE_SCHOOLDOC_MISSIONS_TOKEN` override를 제공한다. 실제 요청 전 기존 `getStudentHome`으로 마니또 세션을 검증한다. 숨김/페이지 이탈/BFCache 복귀·언마운트에서 메모리 자격/응답을 폐기하고 늦은 응답 적용을 막는다.

검증은 가상 client를 주입한 로컬 미리보기와 자동 계약/수명주기 검사로 수행했다. 자동 9개, 웹 빌드, 미리보기 별도 TypeScript 검사를 통과했다. IAB에서 1280·768·390·360·320px, 60개/100자 제목/1000자 설명, root 글자 크기 200% fixture, 조회·완료·취소·확인 대기·오류·불확실 저장 후 재조회·키보드 E/Enter/Tab·브라우저 뒤로/앞으로·월드 위치 복귀를 확인했다. 세부 증거와 아트 프롬프트는 [6개 관점 검토 기록](design-reviews/2026-10-30-today-tasks-page.md)에 남겼다.

미확인: 실제 학생 자격에 의한 운영 Schooldoc 조회/저장과 양쪽 화면 결과 대조, 실제 Firebase 로그인/카드 무효화 통합, 화면 읽기 프로그램·실기기 터치·학생 이해도·브라우저 자체 zoom. 글자 확대는 preview root font 16→32px로 검증했다. IAB 새 탭 생성은 원래 문서의 visibility를 바꾸지 않아 실제 탭 숨김은 재현하지 못했으며, 해당 이벤트의 정리·abort는 자동 검사로 보호한다. 서비스 배포·Git 푸시는 수행하지 않았다.

## 14. 사용자 후속 요청: 추가 로그인 없는 자동 연결

사용자는 현재 한 학급만 사용하며 동명이인이 없다고 확인했다. 이에 따라 §3의 이름/개인코드 재입력 흐름은 실제 학생 화면에서 사용하지 않는다. `StudentTodayTasks autoConnect`는 매 조회/저장 직전에 `authorize`를 호출하며, main은 기존 `getStudentHome` 응답의 최신 본인 `displayName`을 반환한다. 그 이름만 기존 Schooldoc API의 동일 body에 전달한다. Schooldoc 원본 화면·서버·Supabase 설정·DB는 변경하지 않았다. 두 인증 시스템을 통합한 SSO나 신규 서버 ID 매핑으로 표현하지 않는다.

최초 진입과 화면 복귀는 자동 조회이며, 오류 때는 재입력 없는 ‘다시 불러오기’와 선생님 도움을 제공한다. 수동으로 연결을 끝내면 재열기 전까지 자동 조회를 멈춘다. 화면 숨김/pagehide/BFCache에서는 응답/자격을 폐기하고 보이는 상태로 돌아온 뒤 재검증한다. 조회 후 등록 이름이 바뀌면 쓰기 전에 차단하고, 응답 학생명이 다르면 미션을 표시하지 않는다. 이름 유사도 매칭·다른 학생 탐색은 하지 않는다.

한 학급·동명이인 없음·두 서비스 등록 이름 일치가 적용 조건이다. 학급 확장이나 중복 이름은 교사 확인 기반 ID 매핑/서버 브리지의 별도 검토가 필요하다. [기능 사전·사후 검토](design-reviews/2026-10-30-today-tasks-auto-connect.md), [부모 통합 검토](design-reviews/2026-10-30-today-tasks-auto-connect-integration.md)를 따른다. 유효한 실제 학생의 운영 조회/저장과 실제 Firebase 세션 차단은 여전히 미확인이다.

## 15. 기존 카드와 실제 Schooldoc 왕복 검증

사용자가 실제 검증을 요청하고 대상 학생을 직접 지정했다. 지정 학생의 원본 Schooldoc 조회와 우리 실제 client 조회가 현재1건·전체12건·완료3건으로 일치했다. 우리 화면의 완료 표시가 원본에서 현재0/완료4로 반영됐고, 원본 취소 뒤 우리 화면 재조회도 현재1/완료3으로 복원됐다.

이 과정에서 기존 카드 로그인이 실패하는 원인은 로컬 `.env.local`의 demo-manitto Emulator 설정과 미실행 Emulator로 확인됐다. 기존 Firebase 웹 앱 공개 SDK 설정으로 git 제외 `.env.cloud.local`을 만들고 cloud 모드의5175 고정 빌드를 실행했다. 기존 학급 DB·학생·카드·loginStudent/Custom Token은 변경하지 않았다. 사용자가 기존 카드의 로그인 성공을 확인한 뒤 실제 마을→오늘 할 일에서 추가 입력0개·본인 이름 자동 조회, 완료→취소→서버 재조회까지 성공했다. 최종 상태는 원래 해야 할 일/1·3으로 복원했다. 정상 변경 이력은 삭제하지 않았다.

공개 API 검사 전용 localhost 임시 진입점/서버는 제거했다. 실제 사용자 화면과 이름 없는 상태 캡처만 유지한다. Firebase/Supabase/Vercel 배포·GitHub 푸시는 없다. 실제 카드 차단/재발급·실기기·화면 읽기·학생 이해도는 미실시다. 한 학생/현재 미션의 실제 검증이며 다른 미션의 기간/확인 정책 전체를 실데이터로 재검증했다고 주장하지 않는다. [세부 검증·6관점 기록](design-reviews/2026-10-30-today-tasks-live-verification.md)을 따른다.

## 참고한 주요 파일

### 마니또

- `web/src/StudentClassroom.tsx`
- `web/src/main.tsx`
- `web/src/firebase.ts`
- `web/src/student-world.css`
- `docs/design-reviews/2026-10-30-classroom-today-link.md`
- `docs/experts/README.md` 및 여섯 프로파일·검토 양식
- `AGENTS.md`, `docs/manitto-development-plan.md`, `docs/design-revision-plan.md`, `docs/firestore-schema.md`, `docs/functions-api.md`, `docs/work-log.md`

### Schooldoc (읽기 전용 조사)

- `AGENTS.md`
- `src/App.tsx`
- `src/features/classMissions/PublicClassMissionsPage.tsx`
- `src/features/classMissions/missionApi.ts`
- `src/utils/supabaseClient.ts`
- `supabase/functions/class-missions-public/index.ts`
- `supabase/functions/_shared/classMissions.ts`
- `supabase/functions/_shared/classMissionsServer.ts`
- `supabase/migrations/202609270100_class_missions.sql`
- `tests/e2e/class-missions.spec.ts`, `tests/server/classMissions.test.ts`
