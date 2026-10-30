# 전문가 검토 기록: 도트 마을 오른쪽 확장 아트

## 검토 정보

- 날짜: 2026-10-30
- 요청/범위: 사용자가 서브 에이전트를 활용해 마을을 오른쪽으로 길게 만들고 건물 네 채를 더해 달라고 요청했다. 본 에이전트 범위는 신규 도트 배경 이미지와 좌표 명세다. 기존 이미지·이동 코드·기능 라우트는 부모 에이전트 소유다.
- 수행: `/root/town_extension_art` 한 에이전트가 여섯 가상 프로파일을 적용했다. 외부 전문가 참여는 없다.
- 자료: `world-town-v2.webp`, 승인된 도트 로그인/월드 맥락, 전문가 운영 지침·6개 프로파일, imagegen 스킬.
- 설계: 기존 1774×887 마을을 보존하고 오른쪽에 같은 2:1 비율의 신규 도트 구역을 잇는다. 새 구역은 서로 다른 네 건물의 외형만 제공한다. 기능 이름과 UI는 확정하지 않는다.

## 사용자 과업과 아트 계획

- 학생은 기존 마을에서 오른쪽으로 걸어가며 추가 건물 네 채를 발견한다. 실제 페이지/상호작용 연결은 부모 구현 범위다.
- 기존과 같은 측면 16비트 픽셀 마을, 낮 시간 하늘·수목·호수/산 배경, 목재 건물·꽃·돌벽을 사용한다. 도로는 높이 약 79~84%의 연속된 수평선으로 유지한다.
- 새 패널 건물은 중심 약 15/39/64/87%에 배치한다. 새 기능은 미정이므로 도서관형·공방형·모임홀형·천문대형의 형태만 구분한다.
- 배경에 사용자 데이터·텍스트·버튼·등급/재화/순위를 넣지 않는다. 실제 이름 표지와 접근 가능한 컨트롤은 HTML에서 처리한다.
- 모바일/확대는 부모가 지도 스크롤과 크기로 대응한다. 원본 고해상도·기하를 보존한 WebP로 전달하며 건물 클릭 범위와 중심 좌표를 보고한다.

## 여섯 관점 사전 개별 판단

| 프로파일 | 판단과 근거 | 판정 |
|---|---|---|
| WD-01 시각 구성 | 기존 도트 마을을 스타일 참조로 사용해 오른쪽 구역의 색·픽셀 밀도·조명·건물 배율을 맞춘다. 서로 다른 실루엣으로 네 랜드마크를 구분한다. | 통과 |
| WD-02 반응형/타이포 | UI 글자를 이미지에 넣지 않고 독립된 가로 패널을 제공한다. 부모가 모바일에서 폭을 줄여 글자를 뭉개는 대신 가로 탐색하도록 연결할 수 있다. | 통과 |
| UX-01 정보 구조 | 확장 공간은 기존 네 목적지 뒤에 이어진다. 기능이 미정인 건물을 기존 제공 기능으로 오해하지 않도록 외형만 제공하고 이름/상태는 부모의 HTML 표지로 표시한다. | 통과 |
| UX-02 인지/이해 | 네 건물은 뚜렷한 외관으로 장소를 인식하게 하지만 실제 제공 기능을 암시하는 문구/성과 요소는 넣지 않는다. | 통과 |
| UI-01 조작/상태 | 이미지는 인터랙션을 가장하지 않는다. 문·중심·도로 위치를 좌표로 전달해 부모의 실제 클릭/근접 조건과 맞출 수 있다. | 통과 |
| UI-02 접근성/품질 | 본 자산은 장식 배경이며 의미와 조작 이름은 HTML에서 유지한다. 생성 이미지에 읽어야 할 텍스트/컨트롤을 굽지 않는다. | 통과 |

## 발견/조치와 착수 판정

| ID·심각도 | 문제 → 근거 → 영향 | 수정안 | 담당·확인 |
|---|---|---|---|
| P2-01 | 새 구역 도로/배율이 다르면 캐릭터가 뜨거나 연결선이 끊겨 보임 → H4·공간 일관성 → 탐색 몰입 저하 | 기존 이미지의 기준선·카메라·픽셀 밀도를 명시하고 생성 결과의 도로/건물 좌표를 확인한다. | 아트 담당, 생성 후 시각 확인 및 부모 통합 시 실제 브라우저 |
| P2-02 | 새 건물의 의미를 이미지 글자로 확정하면 기능 미구현을 오해함 → H1/H2 → 학생이 기대한 기능을 찾지 못함 | 텍스트/UI 없는 이미지, 기능명 미정 상태는 HTML에서 별도 표시 | 아트 담당/부모, 생성 후 글자·UI 유무와 상호작용 상태 확인 |

- 여섯 관점 모두 사전 통과, 미해결 P0·P1 없음. 아트 생성 착수 가능.
- 기존 파일을 덮어쓰지 않고 신규 파일 `web/src/assets/world-town-east-v1.webp`로 저장한다.

## 생성 후 아트 검토

- 내장 image_gen으로 새 이미지 1개를 생성했다. 기존 패널은 스타일/크기/높이 참조로만 제공하고 원본을 변경하지 않았다. 출력과 최종 WebP를 각각 시각 확인했다.
- 생성 원본: `/Users/taeho/.codex/generated_images/01a18a91-d4f8-7691-b888-e484414ba1d5/exec-f7bdc58c-9cb7-497e-b7f0-4809ea2203c3.png`
- 최종 앱 에셋: `web/src/assets/world-town-east-v1.webp` — 1774×887px, RGB, 588,742 bytes. Pillow WebP quality=92/method=6 인코딩만 적용했고 크기/내용/기하는 바꾸지 않았다. 원본 PNG는 보존했다.
- 붉은 지붕 읽는집형·보라 지붕 공방형·녹색 지붕 모임홀형·푸른 돔 관측소형의 네 건물이 확인된다. 이는 외형 구분이며 실제 기능명을 확정하지 않는다.
- 길은 약 y=79~84%, 앞쪽 돌벽은 약85~100%로 기존과 맞는다. 카메라·픽셀 밀도·하늘색·꽃과 나무의 도트 스타일도 기존 패널과 유사하다. 왼쪽 경계는 수목/울타리/길로 구성되어 연결 가능하지만 픽셀 단위 완전 이음새는 최종 브라우저 연결에서 확인해야 한다.
- 읽어야 할 글자·UI·버튼·캐릭터·점수·재화가 없는 배경 이미지임을 확인했다. UI 글자와 실제 상호작용 상태는 부모의 HTML 구현으로 제공한다.

| 프로파일 | 생성 후 아트 범위 판단 | 판정 |
|---|---|---|
| WD-01 | 기존 도트 밀도·조명·색을 따르는 네 건물 외형이며 서로 다른 실루엣을 확인했다. | 아트 범위 통과 |
| WD-02 | 기존과 같은 2:1/1774×887px 에셋이며 글자를 굽지 않아 반응형 표지를 별도로 처리할 수 있다. 실제 화면 재배치는 부모 검토 대상이다. | 아트 범위 통과 |
| UX-01 | 새 구역 네 랜드마크의 실제 입구/클릭 영역을 좌표로 전달한다. 기능 정의는 미확정 상태다. | 아트 범위 통과 |
| UX-02 | 건물의 형태를 구별할 수 있고, 제공 중 기능이라고 주장하는 텍스트/UI가 없다. | 아트 범위 통과 |
| UI-01 | 실제 입구와 건물 경계를 읽어 구현 좌표를 제공한다. 누르기/상태/페이지 전환의 실제 검증은 하지 않았다. | 아트 범위 통과 |
| UI-02 | 배경에 조작/UI를 굽지 않았고, 모든 기능의 의미·대체 입력은 부모의 HTML에서 제공할 수 있다. | 아트 범위 통과 |

- 본 에이전트 완료 판정: 신규 확장 아트와 좌표 명세 준비 완료. 브라우저 연결·캐릭터 이동·클릭·실제 화면의 이음새는 부모 담당이며 본 기록으로 전체 서비스 구현 완료를 주장하지 않는다.
- 잔여 P2-01: 최종 합쳐진 화면의 이음새/발 위치·반응형은 부모가 실제 브라우저에서 확인한다. 에셋의 길 기준선/배율은 시각 확인했다.

## 부모 통합용 좌표

모든 숫자는 이미지의 백분율이다. 전체 월드를 기존/신규 패널 동일 폭으로 좌우 배치한 경우의 좌표도 병기했다. 첫 건물은 본채 창이 왼쪽, 입구 날개가 오른쪽이므로 시각 중심과 실제 문 중심이 다르다.

| 신규 외형 | 새 패널 입구 x | 표지 권장 x / y | 클릭 영역 left / top / width / height | 합친 전체 0~100 입구 x | 기존 좌표를 0~200으로 연장할 때 입구 x |
|---|---:|---|---|---:|---:|
| 붉은 지붕 읽는집형 | 24.5 | 18 / 33 | 2 / 34 / 30 / 44 | 62.25 | 124.5 |
| 보라 지붕 공방형 | 40 | 41 / 43 | 33 / 44 / 20 / 34 | 70 | 140 |
| 녹색 지붕 모임홀형 | 67.5 | 67 / 27 | 54 / 29 / 28 / 49 | 83.75 | 167.5 |
| 푸른 돔 관측소형 | 90.8 | 90 / 34 | 83 / 35 / 17 / 43 | 95.4 | 190.8 |

- 전체 0~100 좌표로 환산할 때 새 패널 클릭 영역 left=(100+localLeft)/2, width=localWidth/2, top/height는 동일하다.
- 기존 패널의 현재 x 좌표를 유지하고 범위를0~200으로 늘린다면 새 패널은 left=100+localLeft, width/top/height는 동일하다.
- 이미지 자체에는 기능 이름을 쓰지 않았으므로 임시 표지는 ‘새 공간’/‘준비 중’ 등 현재 상태를 명확히 나타내는 이름으로 붙일 수 있다.

## 최종 생성 프롬프트

```text
Use case: stylized-concept. Asset type: production raster artwork for the RIGHT-HAND EXTENSION PANEL of an existing side-scrolling elementary classroom pixel-art village. Input image 1 is the existing LEFT panel and is a STYLE, SCALE, LIGHTING and EDGE CONTINUITY REFERENCE, not content to redraw. Create ONLY a new 2:1 horizontal panel that would sit immediately to the RIGHT of that image. Preserve the original reference separately. Match its polished detailed 16-bit square-pixel clusters, turquoise blue sky, bright morning lighting, lush green trees, distant lake and hills, warm timber architecture, flower beds and stone-wall foreground. CRITICAL continuity: the pale horizontal walking path continues across the entire panel at 79%-84% image height, with grass and layered stone wall below to the bottom; same camera elevation and pixel density, no slope, stairs or water crossing on the main walking path. At the extreme left edge, continue the foliage/tree/fence and path tones seen at the RIGHT edge of the reference, with a natural leafy transition and no border or hard composition cut. Four NEW distinct buildings in the lower-middle, all entrances along the walking path: around x=15% a cozy timber reading-house with tall arched windows and a red-brown gable roof; around x=39% a compact purple-roof craft workshop with warm windows and a small outdoor workbench; around x=64% a welcoming green-roof communal hall with broad double doors; around x=87% a small charming blue-domed observatory with a short telescope silhouette on its roof. Buildings must be clearly separated and each roughly the scale of the existing school/greenhouse/post-kiosk landmarks, with recognizable complete silhouettes and front doors. Existing buildings from the reference must NOT be repeated. The upper half should mostly be sky, clouds and distant treetops, allowing HTML markers to overlay later. No characters, people, animals, lettering, letters, text, readable signs, numbers, UI, frames, buttons, labels, map markers, currency, scores, weapons or watermark. This is finished original pixel-art environment artwork, not an interface screenshot, not simple vector/SVG blocks, not a painterly scene. No UI text is baked into the image.
```
