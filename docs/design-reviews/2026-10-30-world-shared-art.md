# 전문가 검토 기록: 공통 나무 질감과 도트 UI 아이콘

## 검토 정보

- 날짜: 2026-10-30. 수행: `/root/teacher_mail_inbox`의 여섯 가상 프로파일별 역할 검토. 외부 인간 전문가 참여·승인을 뜻하지 않는다.
- 요청: 사용자가 재첨부하고 선호를 확정한 ‘오늘 할 일’ 시안의 도트 교실·두꺼운 실제 나무 게시판·양피지·픽셀 아이콘·큰 초록 CTA를 공통 스타일로 사용한다.
- 이 담당 범위: 나무 질감 bitmap 1개, 3열2행 투명 픽셀 아이콘 sprite 1개와 이 검토 기록. 서비스 코드·기존 배경·참조 이미지는 수정하지 않는다.
- 자료: 사용자 시안 `/var/folders/sz/c2z4277j79d305w80625jclr0000gn/T/codex-clipboard-fe41ee99-f5a8-4bac-9b9f-1b3979baca73.png`를 `view_image`로 확인했다. imagegen 스킬·전문가 운영 지침·여섯 프로파일과 공통 프레임 계획을 참조한다.

## 과업·설계·상태·반응형

- 나무: 1024×1024 정사각형, 정면에서 본 따뜻한 오크 가로 판재와 선명한 16비트 나뭇결. 부모가 공통 헤더/외곽 배경 tile로 사용한다. 글자·아이콘·UI·원근·별도 큰 프레임·공간 풍경 없음.
- 아이콘: 1536×1024 PNG의 정확한 3열2행, 512px 정사각 셀 각각 중앙에 하나. 순서는 위행 clipboard/envelope/desk, 아래행 book/sprout/bulletin-board. 배경은 실제 alpha 투명, 모든 아이콘은 셀 안 여백과 일관된 픽셀 윤곽/팔레트 유지. 글자·숫자·별도 셀 테두리·UI 없음.
- HTML의 제목·버튼 라벨·상태는 이미지에 굽지 않는다. 아이콘은 장식 또는 보조 의미로 사용하고 텍스트 라벨을 보존한다. 입력·오류·저장 로직은 아트 담당 범위 밖이다.
- 작은 화면에서 부모가 동일 sprite 셀을 비율 유지해 축소하며 아이콘이 읽어야 할 본문을 대신하지 않는다. 나무는 어두운 바탕의 장식이고 실제 글자는 충분한 대비로 별도 배치한다.
- built-in image_gen을 사용한다. 생성 PNG 원본을 보존하고, 나무만 내용·기하를 바꾸지 않는 WebP 인코딩을 허용한다. 투명 아이콘의 alpha를 합성/수작업 제거하지 않는다.

## 여섯 관점 사전 개별 판단

| 프로파일 | 판단과 근거 | 판정 |
|---|---|---|
| WD-01 | 승인 시안의 따뜻한 오크 명암·실제 도트 나뭇결과 굵은 윤곽의 아이콘을 공통 재료로 재현해 기능별 스타일 단절을 줄인다. | 통과 |
| WD-02 | 글자/버튼을 이미지에서 분리하고 정사각 tile·고정 셀 sprite를 제공해 반응형에서 재사용한다. | 통과 |
| UX-01 | 원본 시안의 기능 의미는 HTML에서 유지하고 아트는 기능의 위치와 조작을 대신하지 않는다. | 통과 |
| UX-02 | 단순하고 구분되는 여섯 물건으로 의미를 보조하되 새 기능·보상·재화 의미를 추가하지 않는다. | 통과 |
| UI-01 | 버튼/선택 상태를 아트에 그리지 않아 실제 조작과 장식이 혼동되지 않는다. 정확한 셀 정렬로 잘림·인접 아이콘 노출을 예방한다. | 통과 |
| UI-02 | 아이콘을 텍스트 없이 유일한 조작 정보로 쓰지 않는 전제이며 실제 투명 alpha와 셀 내 여백을 검증한다. | 통과 |

## 발견·조치·착수 판정

| ID·심각도 | 문제 → 근거 → 사용자 영향 | 수정안 | 담당·확인 |
|---|---|---|---|
| A-01 P2 | CSS 단색/선형 그라데이션만 나무로 쓰면 승인 시안과 달라짐 → 시각 일관성 → 기능별 공통 스타일 신뢰 저하 | 실제 픽셀 나뭇결 bitmap을 생성하고 부모가 공통 소비 | 아트·생성 후 원본 비교/부모 통합 |
| A-02 P1 사전 해소 | 투명처럼 보이는 체크무늬·불균일 셀 위치 → H4/H5 → UI에서 배경 상자·잘린 아이콘 노출 | 실제 alpha·정확한 3×2 셀·넉넉한 여백을 생성 조건으로 명시하고 파일 검사 | 아트·alpha/경계 검사 |
| A-03 P2 | 이미지 안 텍스트·버튼이 HTML과 중복 → H1/H8 → 접근성·반응형 손실 | 재료·물건만 생성, 글자/숫자/UI 금지 | 아트·시각 확인 |

- 여섯 관점 사전 통과. A-02 해결안을 생성·검증 계획에 반영했으며 미해결 P0·P1 없음으로 아트 제작 착수.

## 생성 후 검증

- built-in image_gen으로 제작했다. 참조 시안은 스타일 참조로만 사용하고 별도 보존했다. PNG 원본은 `/Users/taeho/.codex/generated_images/01a18a9d-0f2e-74a2-915e-1d86ea9fcff5/`에 그대로 둔다. CLI/API 키·수작업 드로잉·알파 제거·재배치·리사이즈는 사용하지 않았다.
- 최종 나무 원본: `exec-55046806-5a0a-4141-a763-a59b325dbc68.png`. 최종 앱 에셋: `web/src/assets/world-wood-texture-v1.webp` — **1254×1254 RGB, 143,150 bytes**. Pillow WebP quality92/method6 인코딩만 적용했다.
- 나무는 최초 생성과 크기만 요청한 표적 수정 모두 1254×1254를 반환했다. 요청한 1024 파일 크기와 다른 점을 부모에게 보고했다. 임의 리사이즈를 하지 않고 native 정사각 tile로 제공한다. CSS의 background-size로 표시 크기는 정할 수 있다. 가로 판재·풍부한 오크 명암·나뭇결·매듭·정면 평면·글자/UI 없음은 시각 확인했다.
- 최종 아이콘 원본: `exec-54ebdac8-4fc4-4764-992e-429cb20694e7.png`. 최종 앱 에셋: `web/src/assets/world-ui-icons-v1.png` — **1536×1024 RGBA, 1,382,757 bytes**. PNG를 그대로 복사했으며 내용/알파/배치를 편집하지 않았다.
- 초기 아이콘 원본 `exec-79758f75-f236-44be-9105-d40f6eed6a51.png` 및 수정본 `exec-587e432a-4e97-4778-adad-59ef178d0525.png`는 개체가 커서 폐기 후보로 두고 보존했다. 최종은 reference에서 다시 생성해 여백을 늘렸다.
- 정확한 3열2행/512px 셀과 요청 순서를 확인했다. 전체 alpha0 픽셀은 1,198,840(약76.2%)다. 모든 바깥 모서리는 alpha0이며 셀 경계 alpha 최대1/254로 육안상 비어 있다. 개체 내부 alpha 최대254, 일부 배경/윤곽 픽셀은 alpha1~20의 생성 도구 가장자리 값이 남는다. 검은/갈색 바탕이 불투명하게 구워진 파일은 아니다.
- 검증용 alpha>20의 셀 상대 개체 bbox는 아래와 같다. 아이콘마다 크기/시각 중심이 수학적으로 완전히 같지는 않지만 개체가 인접 셀을 침범하지 않는다. 개체 여백은 가장 작은 곳도 약73px 이상이다. 최종 프롬프트의 central260px/126px 여백은 모든 개체에서 정확하게 지켜지지 않았으며 이 차이를 숨기지 않는다.

| 셀·용도 | 배경 위치 | 셀 상대 bbox (left,top,right,bottom) |
|---|---|---|
| 0,0 clipboard | 0% 0% | 152,138,362,408 |
| 1,0 envelope | 50% 0% | 134,197,379,382 |
| 2,0 desk | 100% 0% | 123,158,392,439 |
| 0,1 book | 0% 100% | 95,137,424,388 |
| 1,1 sprout | 50% 100% | 164,130,349,379 |
| 2,1 bulletin-board | 100% 100% | 78,119,430,384 |

- 소비 계약: 정사각 아이콘 요소, background-size 300% 200%, 위 배경 위치와 image-rendering pixelated. 여백을 포함하므로 48~64px 슬롯이 적절하며 32px 이하의 유일한 의미 전달 수단으로 쓰지 않는다. 텍스트 라벨은 HTML에서 보존한다.
- 실제 브라우저의 공통 프레임·명암·작은 아이콘 가독성·텍스트 대비·반복 tile 경계·데스크톱/모바일·키보드 조작은 부모 통합 검증 범위다. 이 에이전트는 서비스 코드를 바꾸거나 그런 검증을 완료했다고 주장하지 않는다.

| 프로파일 | 아트 후 개별 판단 | 판정 |
|---|---|---|
| WD-01 | 시안의 따뜻한 목재와 굵은 픽셀 물건 스타일을 재현했다. 단색 CSS 나무가 아닌 실제 bitmap이다. | 아트 통과 |
| WD-02 | 텍스트 없는 재료와 정확한 512px 셀을 전달했다. 나무 native 크기와 아이콘 내부 여백 오차는 명시했고 화면 표시 검증은 부모에 남긴다. | 아트 통과·통합 미확인 |
| UX-01 | 새 기능/버튼을 그림에 만들지 않고 원래 기능 의미를 보조하는 물건만 있다. | 아트 통과 |
| UX-02 | 여섯 물건이 구분되고 글자/숫자/보상 요소가 없다. 실제 저학년의 의미 이해는 시험하지 않았다. | 아트 통과 |
| UI-01 | 실제 alpha와 셀 경계 분리를 확인해 CSS sprite로 소비 가능하다. 클릭/상태/버튼 로직은 추가하지 않았다. | 아트 통과·통합 미확인 |
| UI-02 | PNG alpha 통계·모서리·셀별 bbox를 검증했다. 작은 크기와 화면 읽기·대비 검증은 HTML 통합 단계다. | 아트 통과·통합 미확인 |

- 잔여 P3 A-04: 나무 파일이 요청1024 대신1254 native 출력이다. CSS tile 소비를 막지 않으므로 부모에게 표시 크기 선택/필요 시 후속 에셋 결정을 인계한다.
- 잔여 P3 A-05: 생성 sprite의 시각 중심·개체 크기가 완전 동일하지 않고 아주 낮은 alpha 가장자리가 남는다. 실제48~64px 렌더링에서 원치 않는 그림자/크기 불균형이 보이면 부모가 targeted imagegen 재작업을 결정한다. 임의 픽셀/알파 수정을 하지 않는다.
- 기존 배경·참조 이미지·서비스 코드·다른 문서·작업일지는 변경하지 않았다. 배포·Git 푸시 없음.

## 최종 프롬프트

## 추가 범위 사전 검토: 공통 양피지 질감

- 사용자 후속 요구: 화면 크기에 따라 동적으로 배치되고 도트 배경이 보이는 기능 화면이며, 승인 시안의 종이 표면도 공통 재료로 제공한다. 이 에이전트 추가 범위는 종이 bitmap 하나뿐이고 레이아웃·서비스 CSS는 부모 소유다.
- 설계: 밝은 아이보리 약 #fffaea의 정사각 full-bleed paper tile, 실제 16비트 픽셀의 미세하고 낮은 대비 종이결. 글자·아이콘·프레임·강한 얼룩·접힘·낡은 가장자리·어두운 vignette 없음. 기존 아트/원본 보존, WebP 인코딩만 허용한다.

| 프로파일 | 추가 사전 판단·근거 | 판정 |
|---|---|---|
| WD-01 | 승인 시안의 밝은 종이 표면을 실제 bitmap으로 통일하고 기존 나무/아이콘과 따뜻한 팔레트를 공유한다. | 통과 |
| WD-02 | 글자와 경계를 이미지에서 분리한 정사각 저대비 texture이므로 부모의 가변 크기 패널에 반복 사용 가능하다. | 통과 |
| UX-01 | 정보 구조·기능·입력 순서를 바꾸지 않고 본문 읽기 표면만 제공한다. | 통과 |
| UX-02 | 강한 얼룩/접힘/그림을 금지해 본문·상태와 경쟁하는 시각 요소를 만들지 않는다. | 통과 |
| UI-01 | 텍스처에 버튼/선택/오류 상태를 넣지 않으며 조작은 기존 HTML에서 유지한다. | 통과 |
| UI-02 | 약 #fffaea의 매우 밝고 낮은 대비 재질로 본문 대비를 지키는 계획이다. 최종 밝기와 실제 글자 대비는 생성 후/부모 통합에서 확인한다. | 통과 |

- P2 A-06: 종이 대비가 강하면 텍스트 가독성 저하 → H8/접근성 → 최대한 밝고 균일한 미세 결만 생성하고 색 통계·시각 확인 후 제공한다. 아트 담당 생성 후 확인, 부모 실제 렌더링에서 텍스트 대비 확인.
- 추가 여섯 관점 사전 통과, 미해결 P0·P1 없음으로 양피지 에셋 생성 착수.

### 양피지 생성 후 검증

- built-in image_gen 원본: `/Users/taeho/.codex/generated_images/01a18a9d-0f2e-74a2-915e-1d86ea9fcff5/exec-a9d52c08-f4fa-4a28-b185-ac3a1226828c.png`.
- 최종 앱 에셋: `web/src/assets/world-parchment-texture-v1.webp` — **1254×1254 RGB, 32,368 bytes**. PNG 원본은 보존하고 WebP quality92/method6 인코딩만 했다. 색·크기·내용 편집 없음.
- 원본/최종 WebP를 시각 확인했다. 미세한 사각 픽셀 종이결만 있고 프레임·글자·아이콘·접힘·강한 얼룩·어두운 가장자리·큰 패턴이 없다. native 정사각 texture를 CSS 반복 배경으로 소비할 수 있다.
- 최종 평균 RGB는 253.74/247.94/230.54, 채널 표준편차는 0.65/0.94/1.83이다. 채널 최소값247/239/217을 조합한 보수적 배경색에 대해서도 공통 본문 #263b2c 대비10.49:1, 보조 #586447 대비5.50:1로 계산했다. 실제 렌더링의 덧씌움/폰트/불투명도/상태색 대비 전체를 검증했다는 뜻은 아니다.
- 부모에게 파일 경로·크기·색 통계·대비 계산을 전달했으며 공통 CSS 연결과 반응형 실제 화면 확인은 부모 담당이다.

| 프로파일 | 추가 아트 후 개별 판단 | 판정 |
|---|---|---|
| WD-01 | 시안과 같은 밝은 아이보리 재질이며 나무와 경쟁하는 무늬가 없다. | 아트 통과 |
| WD-02 | 정사각 full-bleed 재료라 다양한 패널 크기에 사용할 수 있고 글자를 이미지에 굽지 않았다. | 아트 통과·통합 미확인 |
| UX-01 | 본문 표면만 제공하고 단계/기능/탐색 구조를 바꾸지 않았다. | 아트 통과 |
| UX-02 | 강한 얼룩/접힘/불필요한 물건이 없어 현재 과업을 방해하는 요소를 추가하지 않았다. | 아트 통과 |
| UI-01 | 버튼·상태·라벨을 포함하지 않고 부모의 실제 HTML 컴포넌트에 적용할 재료다. | 아트 통과·통합 미확인 |
| UI-02 | 낮은 채널 편차와 공통 본문/보조색의 보수적 대비 계산을 확인했다. 실제 기기/글자 확대/포커스 검증은 부모에 남긴다. | 아트 통과·통합 미확인 |

- A-06은 낮은 대비 질감·밝기와 색 통계 확인으로 아트 범위에서 해소했다. 화면 크기에 따른 동적 배치·도트 배경 노출·텍스트 실제 대비는 이 에이전트가 서비스 코드를 변경하지 않고 부모에게 인계한다.

### 양피지 생성 프롬프트

```text
Use case: stylized-concept. Asset type: a production reusable opaque bitmap PAPER MATERIAL tile for a Korean 16-bit pixel-art classroom website. The attached image is STYLE REFERENCE ONLY: match just the blank light ivory parchment surface behind the interface text, not the room, wooden frame or UI. Generate ONE square 1:1 full-bleed material texture. Entire image is a perfectly flat front-facing pale warm ivory paper surface, approximately hex #fffaea, with only extremely subtle very-low-contrast 16-bit square-pixel fiber/grain flecks in nearby cream tones. The page must stay BRIGHT AND EVEN across the full canvas, with no dark edges and no vignette. Pixel texture should be delicate enough to sit underneath real black/forest-green HTML body text without distraction or reduced contrast. Warm refined quiet classroom parchment, not old damaged antique parchment. No frame, no border, no ripped edges, no folds, no crease lines, no stain, no brown blotches, no large mottling, no strong speckles, no patterns, no grid, no ruled lines, no perspective, no shadows, no highlights, no lighting gradient. No text, letters, numbers, icons, buttons, UI, objects, people or watermark. No transparency. Ideally seamless repeating edges with the same near-#fffaea tones. Output only the empty gentle pale pixel PAPER SURFACE, preserving the reference separately.
```


### 나무 최초 생성

```text
Use case: stylized-concept. Asset type: reusable bitmap material tile for a Korean classroom pixel-game website's wooden bulletin-board header and thick outer frame. The input image is STYLE REFERENCE ONLY; do not reproduce its interface, text, room or objects. Create ONE EXACTLY 1024 x 1024 pixel SQUARE full-bleed oak-wood texture tile, viewed perfectly straight-on as a flat plane. Match the reference header's rich warm 16-bit pixel-art oak boards: confident square pixel clusters, orange-brown and honey highlights, dark warm horizontal grain, small tasteful knots, aged but welcoming polished wood, warm consistent lighting. Horizontal plank direction, subtle horizontal joins, visually rich hand-pixelled grain, medium-dark brown with enough calm area behind HTML text. A practical seamlessly repeating material if possible, edges remain same oak tones; no outer border, no bevel, no separate picture frame, no perspective, no drop shadow outside the tile, no vignette. NOT photorealistic wood, not vector lines, not blurry painted noise. No people, plants, furniture, icons, letters, numbers, labels, UI, buttons, watermark, parchment, objects or scene. Preserve the reference image separately; output only the newly generated square material texture.
```

### 나무 크기 표적 수정

```text
Edit target: the attached oak pixel-art texture tile. Keep this exact approved warm oak palette, horizontal grain/planks, square pixel clusters, wood knots, flat front-facing full-bleed texture, and no extra objects. The one targeted correction is to output the same texture as EXACTLY 1024 x 1024 pixels square. This is a material tile for web CSS. Keep it unframed, opaque, full-bleed. Do not add letters, numbers, UI, labels, icons, furniture, parchment, perspective, transparency or vignette. Preserve the source separately.
```

### 최종 아이콘 새 생성

```text
Create a production PNG sprite sheet, EXACTLY1536x1024, true transparent alpha. The attached classroom UI is only a warm 16bit PIXEL ART style reference, not a layout to copy. Six SMALL independent pixel objects in an invisible exact3columns×2rows of512x512 cells. Unlike an illustration, EMPTY TRANSPARENT SPACE must dominate: each object is only260px wide/tall maximum, comfortably surrounded by at least126px blank transparent margin in its512px square cell. Object visual centers exactly (256,256),(768,256),(1280,256),(256,768),(768,768),(1280,768). Top row: wood clipboard with ivory paper, ivory envelope, wood student desk and chair. Bottom row: open book, potted green sprout, wooden school bulletin board. Consistent SMALL scale. Crisp chunky stepped dark-brown pixel outlines with tidy16bit colored pixel clusters, warm oak, cream, foliage green, tiny red/blue accents. Exact transparency: only the actual hard-edged pixel object shapes visible, every surrounding pixel fully transparent alpha0. No shadow, halo, glow, haze, colored backdrop, checkerboard, framing, grid lines, lettering, numbers, labels, rooms, people or UI. Draw each icon inside its own central260x260 square, NEVER enlarge to fill its512x512 cell. This is a sprite sheet cropped into six512px CSS cells; do not let any icon escape the central260 square. Preserve reference separately. The result is just six small isolated school icons with generous empty transparency.
```
