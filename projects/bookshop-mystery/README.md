# 새벽 기록실

쇼츠에서 소개한 단서를 브라우저에서 이어서 조사하는 창작 미스터리다. 홈에서 **폐점한 서점의 마지막 영수증**과 **새벽 세 시에 돌아온 열쇠**를 고를 수 있다.

[새벽 기록실](https://dawn.bambyul.com/)

## 로컬 실행

저장소 루트에서 실행한다.

```sh
yarn workspace @side/bookshop-mystery dev --port 43719
yarn workspace @side/bookshop-mystery typecheck
yarn workspace @side/bookshop-mystery build
```

웹 화면은 영수증과 기록, 추리 답안, 브라우저 진행 상태를 관리한다. Unity 빌드가 있으면 3D 조사대를 Unity로 실행한다. 초기 로딩이 8초를 넘기거나 빌드를 읽을 수 없으면 같은 소품 데이터를 쓰는 WebGL 조사대를 띄운다. 3D가 열리지 않는 브라우저에서는 이미지와 조사 버튼으로 끝까지 플레이할 수 있다.

## 조사 화면과 디자인 시스템

`/`에서 사건을 선택한다. `/cases/last-receipt/`는 영수증 사건 소개를 열며, 기존 `/play/` 주소에서도 바로 조사를 시작할 수 있다. `/cases/returned-key/`에서는 봉투의 표식, 반납함, 야간 일지를 살펴 열쇠가 돌아온 경로를 추리한다. 진행과 결말은 사건별로 이 브라우저에 저장한다. 소개와 결말의 **사건 목록**으로 다른 사건을 고를 수 있다.

타임라인에서 열린 단계를 눌러 이동한다. 현재 단계는 강조된 테두리와 글자로 표시하며, 확인한 단계는 체크를 표시한다. 잠긴 단계는 자물쇠와 점선으로 구분한다. 두 프린터의 밑면을 확인하면 프린터 단계에 Lottie 체크가 재생되고 이관 기록에 **다음** 표시가 나타난다. 프린터 화면에서 이관 기록을 누르면 이동한다. [ReUI Timeline](https://reui.io/components/timeline), [Shadcn Studio Timeline](https://shadcnstudio.com/blocks/marketing-ui/timeline-component), [ReUI 라이선스](apps/web/public/licenses/reui.txt)

모바일에서는 날짜와 기기 번호를 3D 장면 위에 둔다. WebGL에서 프린터의 회전 방향마다 화면에 투영된 기기 경계를 구해 확대하고 가운데로 맞춘다. 조작 영역은 왼쪽 회전, 오른쪽 회전, 보고 있는 면에서 전환할 면의 이름을 한 줄에 표시한다. 프린터 및 기록 확인을 마치면 타임라인에서, 사건을 해결하면 결말에서 Lottie 체크가 한 번 재생된다. 다시 방문하거나 모션 줄이기를 설정한 경우 정지 체크를 표시한다.

이관 대장, 작업일지, 코드표를 확인하면 최종 추리가 열린다. 증거 수첩은 조사한 자료만 모으며, 추리 중에도 수첩을 열어 답안 초안과 함께 사용할 수 있다. 힌트는 요청할 때마다 한 단계씩 보여 준다. 결말에서 **다시 조사**를 선택하면 저장한 완료 기록을 보존한 채 현재 탭에서 처음부터 진행한다.

`@use-funnel/core`를 브라우저 히스토리에 연결해 뒤로 가기와 앞으로 가기를 지원한다. 조사 단계는 사건별 `history.state`에 저장한다. 주소의 경로만 바꿔 사건 선택·조사 전환 중에도 쇼츠 유입 매개변수와 해시를 보존한다. [토스 use-funnel](https://github.com/toss/use-funnel)

`@side/design-system`의 버튼, 폼, 다이얼로그, Disclosure, Tabs와 다크 테마 토큰을 사용한다. 증거 비교에 필요한 값과 터치 조작을 우선 배치하는 데 2025년 출시 이후 2026년에도 업데이트된 The Roottrees are Dead의 작은 화면용 개편을 참고했다. [출시 정보](https://store.steampowered.com/app/2754380/The_Roottrees_are_Dead/), [개발사 변경 기록](https://steamcommunity.com/app/2754380/announcements/)

### 랜딩 커버

`apps/web/public/assets/last-receipt-cover.webp`는 내장 ImageGen으로 만든 서점 카운터 스틸이다. 1619×971 이미지를 약 101KB의 WebP로 저장해 사용한다.

<details>
<summary>커버 생성 프롬프트</summary>

Create one original photorealistic cinematic still for a landscape hero of a Korean indie detective game set in a closed neighborhood bookstore after midnight. Hero composition, wide 3:2 or wider, seen at the height of a worn dark walnut checkout counter. On the right two thirds, a single curled, ivory thermal-paper receipt in the foreground and a small old translucent dark POS receipt printer close behind it, lit by one warm amber desk lamp. Deep rows of muted books and cool slate-blue night at the window in the distance. Keep the most distinct receipt and printer within the central-right portion so a narrow mobile crop retains both. The left 38 percent is quiet dark charcoal negative space for separately overlaid Korean type, with minimal detail and low contrast. Restrained high-end thriller cinematography, 35mm film grain, finely visible wood and paper textures, warm paper against cool shadows, rich blacks without crushing the main subject. Quietly eerie and plausible, no people, no violence, no logos, no watermark, no UI, no readable numbers or wording on the receipt, no lettering anywhere.

</details>

## Cloudflare Pages 배포

`main`에 조사 앱이나 공용 의존성 변경이 들어가면 GitHub Actions의 **Services**가 타입 검사와 브라우저 테스트를 통과한 버전의 정적 `dist`를 Cloudflare Pages의 `dawn-records` 프로젝트에 올린다. 운영 주소는 첫 배포 후 `https://dawn-records.pages.dev/`에서 열린다. [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)

GitHub Actions의 변수 `BOOKSHOP_MYSTERY_CLOUDFLARE_ACCOUNT_ID`에 대상 계정을 넣고, 시크릿 `BOOKSHOP_MYSTERY_CLOUDFLARE_API_TOKEN`에는 해당 계정의 **Cloudflare Pages Edit** 토큰을 등록한다. 운영 Amplitude 키는 시크릿 `BOOKSHOP_MYSTERY_AMPLITUDE_API_KEY`에서 가져온다. [Cloudflare Pages CI용 인증](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)

로컬에서는 `apps/web/wrangler.jsonc`로 같은 빌드를 미리 확인할 수 있다. 해시가 붙은 번들은 1년간 캐시한다. `/unity/viewer.json`이 없으면 HTTP 404와 함께 조사 화면이 브라우저 WebGL로 전환된다.

```sh
yarn workspace @bookshop-mystery/web build
yarn workspace @bookshop-mystery/web preview:cloudflare --ip 127.0.0.1 --port 43736
```

로컬 Amplitude 검증에서는 `VITE_AMPLITUDE_API_KEY`와 `VITE_AMPLITUDE_STAGE=preview`를 환경변수나 Git에서 무시하는 `apps/web/.env.production.local`로 제공한다.

## Unity 촬영과 웹 빌드

`apps/unity`를 Unity 6.3 LTS에서 연다. 이 프로젝트의 에디터 버전은 6000.3.29f1이고 Web Build Support가 필요하다. 상단 **Bookshop → Create investigation scene**으로 씬을 생성한다. 조사대 소품과 종이는 `Assets/Resources/Bookshop`에 있다.

**Bookshop → Build browser player**는 결과를 `apps/web/public/unity`에 쓴다. 그 뒤 웹을 다시 빌드한다. **Bookshop → Capture portrait shots**는 1080×1920 컷을 `production/.work/unity-capture`에 쓴다.

```sh
"$BOOKSHOP_UNITY_EDITOR" -batchmode -nographics -quit \
  -projectPath "$PWD/projects/bookshop-mystery/apps/unity" \
  -buildTarget WebGL -executeMethod BookshopMystery.Editor.BookshopBuild.Web
```

Unity 소스는 같은 버전의 Unity API 어셈블리로 C# 컴파일을 확인했다. Unity Editor 자체는 활성 라이선스가 없어 Web 빌드와 캡처를 실행하지 못했다. 현재 배포본과 쇼츠는 공유 씬 데이터의 브라우저 WebGL 렌더를 사용한다.

## 쇼츠 제작

`production/episodes.json`은 대사, 화면 제목, 설명, 고정 댓글 초안이다. 기본 장면 데이터 및 종이를 다시 만들 때 Pillow가 설치된 Python으로 `production/make-scene.py`를 실행한다. 브라우저 세로 컷은 로컬 개발 서버를 켜고 저장소 루트에서 아래 명령으로 뽑는다.

```sh
yarn workspace @side/bookshop-mystery capture:browser http://127.0.0.1:43719
```

`production/render-shorts.py`는 Story Studio Shorts의 내레이션, 반주, 자막, 인코딩을 재사용한다. Story Studio Python 실행 환경에서 `PYTHONPATH`에 Shorts 엔진의 `src` 경로를, `STORY_STUDIO_DATA_DIR`에 준비된 음성 모델 데이터 경로를 지정한다. `--renderer unity`를 주면 Unity 캡처 디렉터리를 읽는다. 작업 원본과 완성 파일은 각각 `production/.work`, `production/output`에 저장된다.

열쇠 편은 웹과 같은 봉투·반납함 사진을 사용한다. `render-shorts.py --episode 04-returned-key`로 렌더링하고 `shorts_pipeline.py prepare 04-returned-key --source production/output --play-url https://dawn.bambyul.com/`으로 업로드 패키지와 홍보 초안을 만든다.

새 편집본은 `production/output/revised`에 있다. 첫 컷의 표지 문구, 증거의 크기와 위치, 마지막 프로필 안내를 재편집했다. 같은 Python 환경에서 `--reuse-audio`에 기존 출력 폴더를 지정하면 내레이션, 반주, 자막 시점을 재사용한다.

프린터 편의 최신 영상은 `production/output/handoff/02-printers/short.mp4`다. 마지막 9초에 완료 체크가 재생되고 **다음**이 나타난다. 이관 기록을 누른 뒤 화면 제목까지 보여 주며, 원래 내레이션, 반주, 자막 시점을 사용한다. 격리된 프리뷰에서 이 컷을 캡처하고 제작 명령의 `--printer-handoff`로 넣을 수 있다. PATH에 FFmpeg가 있거나 `DAWN_FFMPEG`에 실행 파일을 지정해야 한다.

```sh
yarn workspace @side/bookshop-mystery capture:handoff http://127.0.0.1:43737
```

## YouTube 업로드와 홍보 패키지

Python 3.11 이상에서 프로젝트 폴더로 이동해 실행한다. 패키지에는 MP4와 세로 표지, 자막, 정사각형 홍보 이미지, YouTube 제목과 설명, 고정 댓글 및 커뮤니티·SNS 문구가 들어간다. 설명 첫 줄에는 기본으로 `https://dawn.bambyul.com/`을 넣는다. `--play-url`로 공개 조사 주소를 지정하면 설명과 홍보 게시물에 같은 목적지를 사용한다.

쇼츠 설명에는 주소가 텍스트로 표시된다. 채널의 고급 기능을 활성화하면 쇼츠마다 **관련 동영상**에 같은 채널의 가로 안내 영상을 연결할 수 있다. 안내 영상은 공개 또는 일부 공개로 설정하고 설명 첫 줄에 `https://dawn.bambyul.com/?from=youtube-shorts`를 넣는다. 업로드가 끝난 쇼츠의 세부정보에서 연결을 저장한다. [YouTube 링크 안내](https://support.google.com/youtube/answer/13748639?hl=ko) · [관련 동영상 추가](https://support.google.com/youtube/answer/14075157?hl=ko)

```sh
cd projects/bookshop-mystery
python3 -m venv production/.work/youtube-venv
source production/.work/youtube-venv/bin/activate
python -m pip install -r production/youtube-requirements.txt
python production/shorts_pipeline.py prepare 02-printers --source production/output/handoff
python -m unittest discover -s production -p 'test_*.py'
```

Google Cloud에서 YouTube Data API v3를 켜고 데스크톱 OAuth 클라이언트 JSON을 내려받는다. `connect`에서 브라우저로 업로드할 채널을 승인한다. 연결 파일은 기본적으로 `production/.work`에 저장한다. [Google 데스크톱 OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [YouTube 업로드 가이드](https://developers.google.com/youtube/data/guides/uploading_a_video)

```sh
python production/shorts_pipeline.py connect production/.work/google-oauth-client.json
python production/shorts_pipeline.py upload production/output/youtube/02-printers
```

OAuth 앱의 게시 상태가 **테스트 중**이면 갱신 토큰은 7일 후 만료된다. 그때 `connect`를 다시 실행해 업로드할 채널을 선택하고 권한을 승인한다. [Google OAuth 갱신 토큰 만료](https://developers.google.com/identity/protocols/oauth2#expiration)

기본 공개 범위는 `private`이다. `--privacy`로 공개 범위를 선택한다. `prepare --upload`는 생성 직후 연결된 채널에 전송한다. Story Studio 제작 환경에서 `--render`를 함께 사용하면 렌더링도 앞에 연결된다. 성공 시 영상 링크를 넣은 `promotion-with-link.md`가 생긴다. 네트워크가 끊기면 같은 폴더에 `upload`를 다시 실행해 이어서 전송한다. 세션이 만료된 경우 Studio에 영상이 있는지 확인한 뒤 새 패키지를 사용한다. [YouTube 재개 업로드 프로토콜](https://developers.google.com/youtube/data/guides/using_resumable_upload_protocol)

## 유입과 조사 결과

Amplitude 프로젝트는 `[prod] dawn-records`(914703)다. 키가 설정된 빌드는 자동 수집을 끈 상태에서 아래 이벤트를 보낸다. 모든 이벤트에 `stage`를 붙이고 사건 관련 이벤트에는 `case_id=last-receipt` 또는 `case_id=returned-key`를 함께 보낸다. 비공개 프리뷰와 테스트 플레이는 `VITE_AMPLITUDE_STAGE=preview`로 빌드한다. 운영 집계는 `stage=production`을 사용한다. 키가 비어 있으면 Amplitude 요청이 발생하지 않는다.

| 이벤트                       | 속성 또는 시점                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `case_catalog_viewed`        | 사건 목록 진입과 `source`                                                                                   |
| `case_catalog_selected`      | 사건 선택 클릭과 선택한 `case_id`, `source`                                                                 |
| `case_catalog_link_clicked`  | 사건 목록으로 돌아가는 링크 클릭과 `from_step`                                                              |
| `case_opened`                | 조사 화면 진입과 `source`                                                                                   |
| `case_landing_viewed`        | 랜딩 진입과 `source`                                                                                        |
| `case_landing_cta_clicked`   | 버튼 클릭, `intent`는 `start`, `resume`, `ending`                                                           |
| `case_landing_link_clicked`  | 조사 중 사건 소개 버튼 클릭과 `from_step`                                                                   |
| `case_timeline_clicked`      | 타임라인 클릭과 `from_step`, `to_step`, 추천한 다음 단계를 눌렀으면 `suggested_next=true`                   |
| `case_scene_loaded`          | `renderer`, 8초 기준 `load_bucket`                                                                          |
| `case_evidence_opened`       | `clue_id`, `entry_point`는 `start`, `primary`, `previous`, `timeline`, `history`, `resume`, `replay`        |
| `case_printer_selected`      | `printer_id`, `entry_point`는 `primary` 또는 `comparison`                                                   |
| `case_printer_bottom_viewed` | `printer_id`, 첫 열람이면 `first_view=true`, `entry_point`는 `primary` 또는 `toolbar`                       |
| `case_record_viewed`         | `document_id`, `entry_point`는 `step`, `document`, `primary`. 현재 조사에서 처음 열었으면 `first_view=true` |
| `case_notebook_opened`       | 열기 당시의 `from_step`, `item_count`                                                                       |
| `case_notebook_item_opened`  | 수첩에서 펼친 자료의 `item_id`                                                                              |
| `case_hint_revealed`         | 요청으로 확인한 힌트의 1부터 시작하는 `hint_index`                                                          |
| `case_replay_started`        | 결말에서 다시 조사를 시작한 시점                                                                            |
| `case_clue_found`            | `clue_id`, `first_clue`. 한 단서는 진행 중 한 번 기록                                                       |
| `case_verdict_opened`        | 최종 추리 양식과 `entry_point`                                                                              |
| `case_answer_submitted`      | 답안 제출 버튼으로 추리를 제출한 시점                                                                       |
| `case_completed`             | 해당 사건의 올바른 답안이 확인된 시점                                                                       |
| `case_shared`                | 공유 완료 또는 복사 성공의 `method`                                                                         |
| `case_follow_clicked`        | 다음 사건 관심 표시를 클릭한 시점                                                                           |
| `case_interest_saved`        | 브라우저 저장에 성공했을 때 `persistence=device`                                                            |

주소 원문, 답안 원문, 검색어와 초대 토큰은 전송하지 않는다. SDK 식별자 저장을 끄고, 게임 진행 상태와 다음 사건 관심 표시를 브라우저에 저장한다.

## 검증 범위

320×568과 390×844 WebKit, 1280×900 Chromium에서 단계별 핵심 내용과 하단 버튼이 첫 화면에 들어오는지 확인했다. 작은 화면에서 문서를 바꿀 때 선택한 문서만 나타나고, 수첩을 닫으면 열었던 버튼에 포커스가 돌아왔다. 실기기와 시청자 유입은 공개 후 검증 대상이다.

- WebKit 320×568과 390×844, Chromium 430×932에서 3D 조사대가 본문 높이를 채우고 단서, 회전과 밑면 조작, 하단 버튼이 한 화면에 들어왔다. 390×844 Chromium의 이미지 모드에서도 밑면을 확인했다.
- 타입 검사, 빌드, 앱의 Playwright 테스트 5개와 `yarn knip`을 통과했다. 320px 화면에서 두 번째 밑면 확인 뒤 **다음**이 나타나고, 완료 모션이 끝난 뒤에도 실제로 이관 기록을 누를 때까지 프린터 화면에 머무는 것을 검증했다.
- Cloudflare 로컬 Worker에서 `/`와 `/play/`의 HTTP 200, 누락된 Unity 매니페스트의 HTTP 404를 확인했다. Wrangler `--dry-run`이 정적 자산 패키지를 읽고 종료했다.
- Amplitude가 `stage=preview` 검증 이벤트 33개를 HTTP 200으로 받았다. 이관 기록을 직접 눌렀을 때의 `suggested_next=true`, 밑면 보기의 진입점, 답안과 주소의 검색어 및 토큰 미전송을 확인했다.
- YouTube 파이프라인의 대역 테스트 5개는 업로드 계획, 패키지, 네트워크 중단 후 이어 보내기, 완료 후 재실행, 변조된 파일 거부를 확인했다. 채널의 실제 업로드는 채널 OAuth 연결 후 수행한다.
- Unity는 브라우저 로더 대역으로 준비 이벤트와 장면 변경 메시지를 확인했다. WebGL을 차단해 이미지 모드로 끝까지 플레이했다.
- 새 쇼츠 3편을 디코딩해 1080×1920, 30fps, 900프레임, 30초, H.264/AAC를 확인했다. 원본 내레이션, 반주와 자막 시점을 사용했다.
