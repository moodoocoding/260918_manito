# 전문가 검토 기록: 실제 도트 이미지로 구성한 학생 로그인

## 검토 정보

- 날짜 / 대상 설계: 2026-10-30 / 학생 로그인 이미지 테마 v1
- 요청·범위: 사용자가 서브 에이전트에게 실제 도트 이미지가 들어간 로그인 화면 구현을 명시했다. 학생 입장 화면의 시각 표현·컴포넌트 분리만 변경한다. 교사 화면·로그인 후 월드·Firebase 인증과 데이터 계약은 범위 밖이다.
- 수행 주체·방식: `/root/pixel_login` 에이전트 한 명이 가상 전문가 여섯 역할을 각각 적용했다. 실제 외부 전문가 참여는 없다.
- 입력 자료: 사용자 요청과 첨부 게임 이미지(분위기 참조), 현재 `web/src/main.tsx` 학생 입장 JSX, `web/src/style.css`, `docs/experts/README.md`와 6개 프로파일, imagegen 스킬
- 검토 단계: 사전 설계. 구현 후 증거는 아래에 별도 기록한다.

## 사용자와 설계안

- 사용자·과업: 초등 1~6학년 학생이 교사가 준 학급 코드와 개인 카드 코드로 로그인해 학급 월드에 입장한다. 이메일·전화번호·신규 계정 입력은 추가하지 않는다.
- 현재 문제: 앞선 로그인은 CSS 블록·그라디언트 중심이며 실제 도트 이미지가 없다. 사용자가 실제 도트 이미지 구성을 요구했다.
- 구성: 독자적인 16비트 픽셀 마을 배경 이미지 → 왼쪽 짧은 환영 문구 → 오른쪽 불투명 로그인 카드. 카드 안은 제목 → 학급 코드 → 개인 카드 코드/보기 버튼 → 자동 로그인·공용기기 안내 → 입장하기 → 카드 분실 도움 순서다.
- 주 행동·저장: 기존 `studentLogin` 흐름과 상위 `task`의 대기·오류 처리를 그대로 호출한다. 입력값과 보기·자동 로그인 상태는 상위 App 제어를 유지한다. 새 저장소·추적·네트워크 호출은 없다.
- 상태: 기본·확인 중·전역 오류·카드 보기/가리기를 유지한다. 이미지 로드 실패에도 단색 배경과 HTML 폼이 남는다. 외부 이미지 URL에 의존하지 않고 생성 자산을 저장소에 복사한다.
- 반응형: 데스크톱은 풍경과 카드가 하나의 프레임 안에 나란히 놓인다. 768px 이하에서는 풍경을 짧은 상단 스트립으로 줄이고 카드가 전체 폭을 쓴다. 390×844px에서 두 입력과 주 버튼을 첫 화면에 노출한다. 320px/200% 확대는 세로 재배치·스크롤로 모든 내용을 보존한다.
- 키보드·텍스트: 배경은 장식 이미지로 `alt=""`와 `aria-hidden`을 제공한다. 실제 라벨·입력·버튼·체크박스를 HTML로 구현하고 Tab/Enter/Space와 명확한 포커스를 유지한다. 이름 선정 전에는 새 서비스명을 고정하지 않는다.

## 6개 관점의 사전 판단

| 프로파일 | 개별 판단·근거 | 문제 ID | 판정 |
|---|---|---|---|
| WD-01 시각 구성 | 도트 풍경은 배경, 불투명 카드가 로그인 초점이다. 입력과 입장하기를 가장 높은 대비로 두고 장식 속에 텍스트가 묻히지 않도록 한다. | P2-01 | 통과 |
| WD-02 반응형·타이포 | 모바일의 풍경 높이를 제한해 필드와 입장 버튼이 장식 아래로 밀리지 않게 한다. 본문은 읽기 쉬운 웹 글꼴과 정상 자간을 사용하고 긴 안내는 줄바꿈한다. | P2-02 | 통과 |
| UX-01 구조·흐름 | 로그인 정보·보조 선택·도움의 순서를 기존 과업에 맞춰 유지한다. 상단 학생/교사 전환과 인증 후 월드 진입은 바꾸지 않는다. | 없음 | 통과 |
| UX-02 인지·이해 | “학급 코드/개인 카드 코드/입장하기”라는 익숙한 표현을 유지한다. 게임 화면의 점수·재화·레벨·성과 비교를 로그인에 추가하지 않는다. | 없음 | 통과 |
| UI-01 조작·상태 | 기존 제어 상태를 props로 연결해 코드 보기·체크박스·확인 중·중복 제출 제한을 보존한다. 이미지에 입력칸을 그려 실제 조작을 흉내 내지 않는다. | 없음 | 통과 |
| UI-02 접근성·품질 | 장식 이미지와 실제 폼 의미를 분리한다. 모든 조작에 이름과 보이는 포커스, 44~48px 클릭 목표를 제공한다. 대비는 불투명 카드 기준으로 확보한다. | P2-01 | 통과 |

## 발견 사항과 조치

| ID·심각도 | 문제 → 근거 → 사용자 영향 | 수정안 | 담당·시점 | 확인 방법·결과 |
|---|---|---|---|---|
| P2-01 | 복잡한 픽셀 배경 위에 필드를 바로 얹으면 경계·대비가 낮아진다 → H8·전경/배경 분리 → 학생이 입력 위치를 찾기 어렵다. | 불투명 크림 카드와 강한 픽셀 프레임, 밝은 입력 영역을 사용한다. | WD-01/UI-02, 구현 중 | 해결: 실제 브라우저에서 카드/입력 영역 구분과 파란 초점 링 확인 |
| P2-02 | 모바일에서 큰 풍경이 필드·CTA를 밀어낸다 → 첫 화면 밀도 기준 → 입장 동작을 찾기 위해 불필요한 스크롤이 생긴다. | 768px 이하 풍경 높이를 축소하고 중복 소개를 숨겨 주 버튼을 첫 화면에 둔다. | WD-02, 구현 중 | 해결: 320/360/390/768/1280px 스크린샷에서 입력·주 버튼 노출 확인 |
| P2-03 | 자동 로그인 선택 후에도 창을 닫으면 로그아웃된다고 안내하면 실제 영구 로그인 동작과 다르다 → H1·H2 → 공용기기에서 학생이 로그인 지속을 오해할 수 있다. | 선택 여부에 따라 유지/종료 안내를 바꾸고, 처리 중 폼 제출도 방어한다. | UX-02/UI-01, 구현 중 통합 리뷰 반영 | 해결: 체크 시 유지 안내, 해제 시 창 종료 로그아웃 안내로 바뀜. 처리 중 폼 guard와 상위 콜백 유지 확인 |

- 의견 차이·선택: 도트 이미지는 충분히 보이게 하면서 실제 로그인 글자는 웹 텍스트로 유지한다. 사용자가 요구한 래스터 분위기와 읽기·조작 품질을 함께 충족하기 위한 선택이다.
- 사전 재판정: 여섯 관점 통과. P2-01·P2-02는 설계에 수정안을 반영했다.
- 착수 판정: 2026-10-30, 미해결 P0·P1 없음. 코드 구현 착수 가능.

## 구현 후 실제 검증

| 환경·폭·입력 | 경로·상태 | 기대 결과 | 실제 결과·증거 | 미확인 |
|---|---|---|---|---|
| 로컬 Vite·IAB 1280×720 | `/student`, 실제 학생 입장 화면 | 도트 풍경과 불투명 로그인 카드가 한 화면에 보인다. | 생성된 마을·캐릭터·게시판·우체통 이미지와 HTML 폼을 스크린샷으로 확인했다. | 실제 인증 제출은 하지 않음 |
| IAB 320×850·360×800·390×844·768×900 | 각 뷰포트의 입장 화면 | 가로 넘침·문구 겹침 없이 입력·CTA가 보인다. | 풍경이 상단 스트립으로 바뀌고 390×844에서 두 입력과 입장하기 버튼이 첫 화면에 보였다. 320px에서도 폼과 체크박스 라벨이 보존됐다. | 실기기 터치·200% 글자 확대 미확인 |
| IAB 390px·클릭 | 코드 보기 → 체크박스 선택 → 가리기/선택 해제 | 카드 input type과 보조 안내가 바뀐다. | type이 text/password로 바뀌고 `aria-pressed`가 반영됐다. 체크 시 ‘다음에도 이 기기에서 바로 들어와요’, 해제 시 창 종료 로그아웃 안내가 표시됐다. | 실제 로그인 유지 결과는 기존 인증 로직 범위 |
| IAB 390px·키보드 | 학급 코드에서 Tab | 다음 조작 초점이 명확하다. | 코드 보기 버튼으로 초점이 이동하고 파란 초점 링이 보였다. | 전체 보조기기·화면 읽기 도구 미확인 |
| 코드·빌드·브라우저 로그 | 인증 경계 확인 | 기존 호출과 대기 상태가 유지된다. | 상위 `studentLogin` 인수/상태 연결을 유지했다. 버튼 disabled/aria-busy 및 busy submit guard가 있고 브라우저 error/warn 로그는 빈 배열이었다. `npm run build`와 `git diff --check`가 통과했다. 기존 약 1.26MB JS 번들 경고는 남아 있다. | API→인증→월드 실세션 통합은 제출하지 않아 미확인 |

| 프로파일 | 구현 후 근거 | 판정 |
|---|---|---|
| WD-01 | 생성 도트 풍경과 불투명 카드의 표면 계층·주 버튼 강조를 실제 브라우저로 확인했다. | 통과 |
| WD-02 | 320/360/390/768/1280px에서 재배치와 CTA 노출을 확인했다. | 통과 |
| UX-01 | 학급 코드→카드→공용기기 선택→입장의 기존 순서와 상위 인증 콜백을 유지했다. | 통과 |
| UX-02 | 서비스명을 고정하지 않은 중립 환영 문구와 코드 라벨, 선택 상태에 맞는 로그인 유지 안내를 확인했다. | 통과 |
| UI-01 | 코드 보기/가리기·체크박스·안내 변경과 busy 중복 제출 guard를 확인했다. 실제 제출은 하지 않았다. | 통과 |
| UI-02 | 장식 이미지의 빈 alt, 실제 입력 라벨·체크박스·버튼 이름, Tab 초점 링과 모바일 렌더를 확인했다. | 통과 |

- 완료 판정: 로컬 화면·조작 검토 완료. 미해결 P0·P1·이번 범위 P2 없음.
- 남은 검증: 실제 학생 이해도·화면 읽기 도구·200% 글자 확대·실기기 터치·실제 Firebase 로그인 제출은 미확인이다. 이를 완료했다고 주장하지 않는다.
- 작업일지: 부모 에이전트가 `docs/work-log.md`에 통합 기록한다.

## 이미지 생성·저장 기록

- 방법: 기본 내장 `image_gen` 도구로 새 이미지 1개 생성. 외부 게임 자산은 사용하지 않았다. UI 글자·입력은 이미지에 포함하지 않는다.
- 생성 원본: `/Users/taeho/.codex/generated_images/01a18a56-18b1-7f10-926c-c1193102212c/exec-8dc69368-8f88-4a44-884e-4170e50eada2.png` (1672×941px, 원본 보존)
- 앱 최종 에셋: `web/src/assets/student-login-world.webp` (1672×941px, 416,314 bytes). 원본과 같은 크기로 Pillow WebP quality=90, method=6 인코딩만 적용해 전송 크기를 줄였다.
- 소비 코드: `StudentLogin.tsx`가 로컬 WebP를 import한다. 크기 속성과 `image-rendering: pixelated`를 제공한다.
- 최종 프롬프트:

```text
Use case: stylized-concept. Asset type: production background raster artwork for a Korean elementary classroom community web login screen. Create an ORIGINAL polished 16-bit pixel-art side-scrolling village scene, landscape 16:9 composition. Consistent crisp square pixel clusters, low-resolution sprite-art feeling enlarged with nearest-neighbor edges, deliberate limited color palette and clean readable silhouettes; no smooth vector edges or painterly blur. Bright turquoise-blue sky with chunky white pixel clouds, lush layered green trees, a cozy small wooden school clubhouse, a garden, a red mailbox, a simple notice board, stone path and warm grassy foreground. Two tiny friendly student adventurer characters with backpacks near the left clubhouse, no detailed faces. Most recognizable village objects sit along the lower third and left two-thirds; the upper half and far right have calm sky and distant greenery, suitable for HTML UI overlay. Charming and welcoming for ages 6-12, playful without babyish exaggeration. Lighting: clear warm morning. Text: NONE. No lettering, no numbers, no logos, no UI, no frames, no buttons, no form fields, no money, no scores, no rewards, no weapons, no copied franchise characters or assets, no watermark. Make the entire output a finished pixel-art landscape image, not a screenshot mockup.
```
