# 제작 명령과 편집 규격

저장소 루트에서 `projects/story-studio/shorts`를 실행한다. Yarn은 `yarn workspace @side/story-studio shorts`에 명령을 붙인다. `shorts setup-voice`를 한 번 실행하면 Apple Silicon Mac에 진행자와 댓글 화자 모델을 준비한다. 새 대화체 화자는 로컬 MLX에서 합성한다. 화자별로 직접 생성한 기준 음성을 사용해 컷이 바뀌어도 같은 목소리로 읽는다. 별도 worktree에서는 기본 체크아웃의 가상환경을 찾는다. 다른 설치는 `STORY_STUDIO_DATA_DIR`, 출력은 `SHORTS_HOME`, 한글 글꼴은 `SHORTS_FONT`로 지정한다. Chromium이 없다면 `yarn workspace @story-studio/web exec playwright install chromium`을 실행한다. [대화체 음성 모델](https://huggingface.co/openbmb/VoxCPM2) · [제작에 사용한 기준 음성](../../../../apps/engine/src/story_studio/shorts/sounds/SOURCES.md)

| 명령 | 결과 |
| --- | --- |
| `shorts setup-voice` | 한국어 대화체 진행·댓글 화자와 기존 편집본 음성 모델 준비 |
| `shorts status` | 오늘의 완성본, 남은 편 수, 이전에 쓴 실베 글 번호, inbox 절대 경로 |
| `shorts leads 목록.html` | 로컬에 저장한 갤러리 HTML에서 글 제목·고유 주소를 추출하고 모바일·PC 중복 제거 |
| `shorts leads 피드주소` | 수집이 허용된 HTTPS RSS/Atom에서 실베 글로 직접 연결되는 항목만 수집. 직접 수집할 피드는 일일 요청에 주소로 제공하거나 inbox의 feeds.txt에 한 줄씩 등록 |
| `shorts capture 자료주소 'text=$140 per person' assets/menu.png` | 공개 자료의 보이는 문구만 PNG로 캡처. CSS 선택자나 로컬 HTML 파일도 지원 |
| `shorts boards boards.html frames` | 로컬 보드를 컷별 PNG로 미리 보기 |
| `shorts daily [소재폴더 …]` | 한국 날짜 기준 최대 두 편. 폴더를 생략하면 inbox의 준비된 에피소드를 확인 |
| `shorts render 소재폴더 새출력폴더` | 편집된 한 편의 별도 시안. 원본과 일일 제작 이력을 보존 |
| `shorts verify short.mp4` | 실제 디코딩으로 1080×1920, 30fps, 900프레임, 30초, H.264/AAC 확인 |

저장 위치는 기본 `~/Movies/실베다큐`이며 `YYYY-MM-DD/01-소재명`과 `02-소재명`이 하루 완성본이다. 실패하면 원고가 inbox에 남는다. 실행이 겹쳐도 아카이브에는 하나의 실베 글이 한 번만 들어간다.

## 한 편 만들기

[소수 비교 예시](../../../../examples/shorts/prime-board)에 편집표와 자체 제작 컷 보드가 있다. `lead`는 실베의 게시일·제목·URL, `sources`는 주장별 확인 자료다. `slug`는 영문 소문자·숫자·붙임표로 쓴다. `title`, `cover`, `description`, `comment`, `tags`, `credits`는 최종 업로드 문구에 쓰인다.

- `shots`에는 초 단위 목표 길이 `seconds`, 화면 제목 `head`, 읽을 `voice`, 자막 `caption`, 지시 `visual`, 출처 `credit`를 적는다. 정수 길이의 합은 30초다. 실제 편집은 원속도 음성과 각 말끝 여백을 확보한 뒤 900프레임을 나눈다. 숫자와 단위는 소리 내 읽을 표현으로 쓰고 자막은 한 호흡마다 줄을 바꾼다. 원고가 길면 문장을 줄여 재실행한다.
- 대화체 진행자는 에피소드의 `narrator`에 `ko-casual-male`을 쓴다. `ko-casual-female`은 밝은 여성 화자, `ko-comment-male`은 가벼운 남성 화자다. 댓글 컷은 `speaker`에 해당 화자를 지정한다. 컷마다 실제로 읽은 파일을 넣으려면 `recording`에 `assets/take.wav`를 지정한다. 이전 원고의 `sohee-playful`과 F1~F5, M1~M5도 같은 이름으로 재생성할 수 있고, 화자 지정이 없는 원고는 M2를 쓴다.
- 상호·가격·인명·말끝이 귀에 걸리면 해당 컷의 `voiceTake`를 2, 3처럼 바꿔 같은 대사를 같은 목소리로 다시 읽힌다. 골라 둔 번호는 다시 렌더해도 유지된다. 숫자와 단위를 평소 읽는 말로 바꾸거나, 의미가 이어지는 두 어절 사이에서 길게 멈추면 한 문장으로 이어 쓰는 방법도 있다. 최종 MP4에서 댓글 앞뒤와 마지막 문장을 확인한다.
- 장면에 딱 맞는 반응이나 바로 답할 질문을 골라 한 편에 댓글 0~1개를 쓴다. `sourceComment`에는 발췌 원문 `quote`, 원글 안에서의 위치 `anchor`, 게시 시각 `time`, 아이디 없는 실제 캡처 경로 `capture`를 적는다. 문구가 잘 읽힐 크기로 보드에 놓고 `shownAsCaption: true`로 지정하면 화면에는 캡처만 나오고 SRT에는 같은 문구가 남는다. 낭독의 숫자·띄어쓰기·문장부호를 자연스럽게 정리하고 설명란에 대독이라고 적는다.
- 제목과 자료의 위치는 고정하고 근거가 달라질 때 컷을 바꾼다. 말 자막은 한 호흡씩 표시한다. 소수 비교 예시는 같은 숫자판에 답을 차례대로 표시한다. 고정 제목 아래 상황을 짧은 말로 잇거나 자료 화면을 교체하며 숫자를 설명할 수 있다. [짤한줌 쇼츠](https://www.youtube.com/shorts/qLlAumpxNAQ) · [방스타 쇼츠](https://www.youtube.com/shorts/PMLz2COouQ0)
- 보드는 1080×1920 CSS 픽셀의 `[data-shot]`을 컷 순서대로 놓는다. 실제 영상은 미리 필요한 구간만 잘라 `assets/`에 넣고 컷의 `media.file`과 위치 `media.box`를 지정한다. 위치는 왼쪽·위·너비·높이 순이다. 클립은 딱 한 번 원속도로 재생하고 음성은 컷의 대사를 쓴다. 출처와 인용 구간을 기록한다. 정지 그림 위 요소는 `data-from=".45"`처럼 컷 길이의 비율로 나타낼 수 있고, `camera: "push"`로 사진을 천천히 당긴다. 로컬 사진과 서체를 사용한다. 기존 960×900 보드와 `frames/1.png` 형식도 읽는다.
- `theme`의 `vermilion`은 콘트라베이스·셰이커 중심, `cobalt`는 업라이트 피아노 중심이다. `tonic`은 36~72 사이의 MIDI 음 번호다. `music`에는 0초부터 순서대로 `at`, `mode`, 편집용 `note`를 지정한다. `tap`, `pulse`, `steps`, `silence`, `bell`, `resolve`가 서로 다른 연주를 만든다. `silence`는 다음 큐까지 반주를 비운다. [악기 녹음 출처](../../../../apps/engine/src/story_studio/shorts/sounds/SOURCES.md)
- 결과 폴더에는 `short.mp4`, 표지, 자막, `timeline.md`, `publish.md`, 실제 프레임·화자·음악 시점을 기록한 `edit.json`, 컷 PNG, 분리된 `narration.wav`와 `music.wav`, 최종 `mix.wav`가 들어간다. 편집표에는 댓글 게시 위치와 캡처가 연결된다.

검색 색인은 갱신이 늦을 수 있다. 사용자가 저장한 목록이나 직접 준 원문 주소도 좋은 출발점이다. 디시 본문·댓글·회원 사진을 자동 복제하는 경로와 유튜브 계정 연결은 이 제작 명령의 입력에 들어가지 않는다. [디시 이용약관](https://nstatic.dcinside.com/dc/w/policy/policy_index.html) · [유튜브 수익 창출 정책](https://support.google.com/youtube/answer/1311392?hl=ko)
