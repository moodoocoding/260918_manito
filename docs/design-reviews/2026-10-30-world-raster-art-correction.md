# 전문가 검토 기록: 로그인과 같은 도트 이미지 월드로 교정

## 검토 정보

- 날짜: 2026-10-30
- 요청·문제: 사용자가 승인한 실제 픽셀 마을 로그인과 달리, 로그인 후 월드는 단순 SVG 사각형·CSS 캐릭터로 구성되어 시각 품질이 현저히 달랐다는 지적이다.
- 범위: `StudentClassroom`의 맵/캐릭터를 실제 생성 픽셀 래스터 에셋으로 교체하고 풍경을 가리는 큰 카드 배치를 작고 명확한 장소 표지로 교정한다. 장소 목적지·인증·백엔드는 유지한다.
- 수행: `/root` 한 에이전트가 여섯 가상 프로파일을 각각 적용했다. 외부 인간 전문가 참여는 없다.
- 자료: 현재 사용자 지적과 열린 `/preview/world.html`, 승인된 `student-login-world.webp`, `StudentClassroom.tsx`, 전문가 운영 지침과 6개 프로파일, imagegen 스킬.

## 사용자·과업·배치

- 학생은 로그인 후 익숙한 도트 마을에 도착하고 캐릭터를 좌우로 움직이거나 장소 표지를 직접 선택한다.
- 하늘·나무·건물·산책길은 실제 픽셀 맵 이미지로, 내 캐릭터는 투명 배경 픽셀 이미지로 구성한다. 글자·기능 표지·도움·로그아웃은 HTML로 제공한다.
- 네 장소를 횡스크롤 맵의 각 랜드마크에 대응시킨다. 오늘 할 일은 기존 Schooldoc URL, 나머지는 기존 내부 화면이다. 큰 불투명 카드 대신 목재색 이름 표지와 짧은 보조 설명을 사용해 풍경을 드러낸다.
- PC는 넓은 풍경, 태블릿/모바일은 지도 안에서만 가로 스크롤한다. 방향 버튼과 방향키/A·D로 이동하고 화면이 캐릭터를 따라간다. 모든 기능은 직접 클릭/Tab·Enter 경로도 가진다. 장소 근처에서는 해당 장소 이름과 별도 ‘들어가기’ 링크/버튼을 보여주고, 지도에 초점이 있을 때 Enter로도 입장한다.
- 상태: 회차 없음/있음 문맥, 이동 상태, 포커스, 이미지 로딩 실패 시 바탕색·명명된 링크를 유지한다. 새 저장/API 호출은 없다. reduced-motion을 따른다.

## 사전 개별 판단

| 프로파일 | 판단·근거 | 판정 |
|---|---|---|
| WD-01 | 승인된 로그인 에셋을 스타일 참조로 삼고 실제 픽셀 이미지 맵/캐릭터로 통일한다. 장소 표지와 상단 문맥은 풍경을 가리지 않으면서 기능 위계를 드러낸다. | 통과 |
| WD-02 | 지도만 가로 탐색하고 페이지/문맥/컨트롤은 폭에 맞춘다. 표지에는 충분한 폭과 줄바꿈을 제공하고 모바일에서 작은 도트 글꼴로 축소하지 않는다. | 통과 |
| UX-01 | 기존 네 목적지를 그대로 보존하고 실제 건물·우체통·게시판 랜드마크에 표지를 연결한다. 지도 위치를 외우지 않아도 직접 표지를 선택한다. | 통과 |
| UX-02 | 캐릭터와 도트 풍경이 승인된 로그인에서 이어지므로 공간 전환을 이해하기 쉽다. 모든 장소에 한국어 이름을 표시한다. | 통과 |
| UI-01 | 캐릭터 좌우 이동·방향 전환과 직접 장소 선택을 분리한다. 링크/버튼 본래 의미, 처리 상태, 기존 목적지를 유지한다. | 통과 |
| UI-02 | 장식 이미지에는 빈 alt, 링크/버튼은 HTML 이름·가시 초점·48px 목표를 유지한다. 움직임 감소 설정도 유지한다. | 통과 |

## 발견 사항·조치

| ID·심각도 | 문제 → 근거 → 영향 | 수정안 | 담당·시점·확인 |
|---|---|---|---|
| P1-01 | 로그인은 세밀한 도트 이미지이나 월드는 평면 도형이다 → 시각 일관성/H4 → 사용자가 기대한 서비스 품질·공간 연속성이 깨짐 | 실제 도트 맵과 투명 캐릭터 생성·사용 | WD-01, 구현 전 에셋 확인 및 구현 후 브라우저 캡처 비교 |
| P2-01 | 넓은 기능 카드가 건물과 풍경을 가림 → H8 → 장면을 탐색하는 경험이 약함 | 랜드마크별 간결한 목재 표지와 직접 입장 경로 제공 | WD-01/UX-01, 구현 시·모바일과 PC 화면 확인 |

- 사전 수정안 반영 후 여섯 관점 통과, 미해결 P0·P1 없음. P1-01은 실제 생성 에셋 사용을 착수 조건으로 고정했다.
- 원본 이미지와 생성 프롬프트를 보존하고 최종 로컬 앱 에셋 경로를 기록한다.

## 구현 후 검토

| 환경 | 확인 내용 | 실제 결과 | 미확인 |
|---|---|---|---|
| IAB 기본 약 847px·1280×900·768×900 | 새 도트 맵과 실제 투명 캐릭터, 네 랜드마크·표지·이동 바 | 평면 SVG와 CSS 얼굴을 제거하고 도트 풍경·캐릭터가 표시됨을 캡처로 확인했다. 네 표지와 한국어 이름이 읽히고 풍경을 크게 가리지 않았다. | 실제 학생 이해도 |
| IAB 390×844·360×800 | 지도 가로 스크롤, 캐릭터 따라가기, 이동/입장 버튼 | 좁은 화면에서 지도 내부만 가로 이동했다. 방향 버튼 6회로 위치가 16%→40%가 되고 미션 정원 상태/입장 경로가 바뀌었다. 캐릭터와 해당 정원이 함께 화면에 들어왔다. | 실기기 터치·200% 글자 확대 |
| IAB 키보드·예시 학급 | Tab/Shift+Tab으로 지도 초점 → 좌방향키 → Return | 지도에 초점이 왔고 캐릭터 위치가 40%→36%로 바뀌었다. 근처 장소의 Enter 경로와 입장 버튼은 예시 미션 이동 안내를 호출했다. | 화면 읽기 도구 전체 사용성 |
| 기존 링크·기능 연결 | 오늘 할 일 Schooldoc 링크 및 내부 목적지 | 지정 URL을 유지했다. 외부 목적지가 읽기 전용으로 열렸으나 데이터를 변경하지 않았고 곧바로 로컬 예시 화면으로 돌아왔다. 내부 미션은 미리보기의 안내 콜백으로 확인했다. | 실제 Firebase 인증 뒤 전체 기능 흐름 |
| 코드·빌드 | React 상태·이벤트·접근성·에셋 | 기능 상태는 전역이 아닌 컴포넌트에 두고 이동 타이머와 resize 리스너를 정리한다. 링크/버튼은 실제 HTML, 이미지 alt는 빈 값, 주변 입장 컨트롤에는 목적지 이름을 제공한다. reduced-motion에서 이동 효과를 끈다. | OS 모션 설정을 바꾼 실동작 검증 |

| 프로파일 | 개별 구현 후 판단·근거 | 판정 |
|---|---|---|
| WD-01 | 승인된 로그인 풍경을 참조한 실제 도트 마을과 캐릭터가 같은 시각 언어로 이어짐을 실제 캡처에서 확인했다. P1-01 해결. | 통과 |
| WD-02 | 기본/1280/768px의 전체 지도와 390/360px의 지도 내부 가로 재배치를 확인했다. 표지 글자·이동 버튼이 겹치지 않음을 실제 캡처에서 확인했다. | 통과 |
| UX-01 | 네 랜드마크 이름과 목적지를 유지하고 직접 선택/근처 입장 경로가 함께 작동했다. | 통과 |
| UX-02 | 평면 도형 대신 명확한 학교·정원·우체국·게시판 도트 이미지와 한국어 표지를 제공했다. 실제 아동 이해도는 미확인. | 통과 |
| UI-01 | 방향 버튼·방향키, 주변 장소 상태, Enter/입장 버튼 콜백을 예시 화면에서 확인했다. | 통과 |
| UI-02 | 장식 alt, 표지 링크/버튼 이름, Tab 초점과 키보드 이동을 확인했다. 주요 이동/입장 컨트롤은 48px 이상으로 설정했다. | 통과 |

- 완료 판정: 여섯 관점 통과, 이번 범위 미해결 P0·P1·P2 없음. 실제 학생/실기기/보조기기/200% 확대/Firebase 실세션은 미확인으로 남긴다.
- 생성 에셋을 쓴 실제 화면을 검토했으며, 빌드나 단순 넘침 수치만으로 판정하지 않았다.
- 최종 `npm run build`와 `git diff --check` 통과. Vite의 기존 JS 번들 크기 경고는 남아 있다.

## 생성 이미지와 프롬프트

- 기본 내장 image_gen 사용. 승인된 `web/src/assets/student-login-world.webp`는 스타일 참조로만 사용했으며 로그인 원본은 교체하지 않았다.
- 맵 원본: `/Users/taeho/.codex/generated_images/01a18a44-429f-7033-88be-186dd0da5e37/exec-76c253e6-5059-48b8-9d5c-799668ac1083.png`
- 캐릭터 원본: `/Users/taeho/.codex/generated_images/01a18a44-429f-7033-88be-186dd0da5e37/exec-47b68c9a-a3ed-44d0-aabf-fcf5cb3f2649.png`
- 앱 맵: `web/src/assets/world-town-v2.webp` (1774×887, 573,748 bytes, WebP quality 92 인코딩).
- 앱 캐릭터: `web/src/assets/world-avatar-v2.webp` (1333×1180 RGBA, 328,668 bytes, lossless WebP, 투명도 유지).
- 원본은 보존했고 앱은 workspace 내부 에셋을 import한다. 인코딩 외 픽셀 내용/기하 편집은 하지 않았다.

맵 최종 프롬프트:

```text
Use case: stylized-concept. Asset type: production background raster for a side-scrolling elementary classroom community game world, not a UI mockup. Input image 1 is STYLE REFERENCE ONLY: match its beautiful polished 16-bit pixel art, crisp pixel clusters, warm wooden buildings, lush foliage, turquoise sky, rich but readable detail. Generate an original panoramic 2:1 horizontal town map. Four clear landmarks arranged left to right across the lower-middle: at 16% width a cozy red-roof school clubhouse with a bright open door, at 40% a garden greenhouse with flowers and raised planting beds, at 65% a charming red postal kiosk with a red mailbox, at 86% a large roofed wooden community notice board under a tree. Have each landmark visually distinct and large enough to recognize. A broad level pale stone/dirt walkway runs continuously across the entire image at 79% height, allowing a separately animated character to walk left/right at a constant baseline. Foreground grass, flowers, stone ledge below the walkway. Background layered green trees, distant hills, warm blue sky and pixel clouds, a glimpse of a lake. Beautiful cohesive hand-crafted pixel scenery matching the reference's quality and density, charming for ages 6-12. Keep upper 30% mostly calm sky and treetops for readable HTML signage overlay. Do not draw people or characters into this map. No text, numbers, letters, logos, UI, cards, buttons, HUD, map markers, banners, flags with symbols, scores, money, weapons, watermark. Pixel art with crisp square pixels, no smooth vector shapes, no flat SVG look. Finished game environment artwork.
```

캐릭터 최종 프롬프트 (`transparent_background=true`):

```text
Use case: stylized-concept. Asset type: a single transparent PNG pixel-art game character sprite. Input image is style reference only. Create ONE friendly elementary-school child adventurer with short dark hair, teal blue cap, mustard yellow small backpack, blue jacket, dark shorts and brown shoes. Original 16-bit pixel art matching the tiny student characters in the reference, crisp square pixel clusters and limited palette, readable compact silhouette. Side-view 3/4 facing RIGHT, full body standing in a relaxed slightly walking pose, arms visible, cute but not babyish. Character occupies 85% of image height with just a small even transparent margin, vertically centered, feet fully visible. A single figure only, no sprite sheet, no multiple frames, no ground, no backdrop, no cast shadow outside the figure, no text, no lettering, no UI, no borders or accessories beyond clothing/backpack. Genuine transparent background, preserve alpha. No copied franchise character.
```
