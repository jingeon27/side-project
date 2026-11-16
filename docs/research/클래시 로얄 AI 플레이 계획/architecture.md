# Mac 중심 클래시 로얄 AI 실행 구조

## 어떤 환경에서 시작할까

### Takeaway

장비를 추가로 사지 않고 **M5 Pro 48GB에서 오프라인 시뮬레이터 → 저장한 경기 영상 인식 → 실제 클라이언트 연결 가능성 검토** 순서로 시작한다. 시뮬레이터에서 AI가 실제 행동을 고르는 것은 가능하지만 공식 Clash Royale의 물리·숨은 상태·새 카드까지 완벽히 재현했다고 간주하지 않는다.

### Cited Findings

- RoyaleGym은 Gymnasium/PettingZoo 기반 Python 환경, Rust 시뮬레이터, 학습기와 뷰어를 제공하고 MIT 라이선스를 명시한다. 공식 설치 안내는 Apple Silicon M1 이상 Mac 경로를 설명하며 **현재 Mac 학습은 CPU에서 실행하고 Apple GPU를 사용하지 않는다**고 명시한다. [프로젝트](https://github.com/RoyaleGym/RoyaleGym), [Mac 설치 안내](https://royalegym.github.io/RoyaleGym/install/)
- RoyaleGym quickstart는 무작위 상대에게 배우는 예제를 제공하며, 처음부터 시행착오만으로 학습한 봇이 강한 플레이를 보장하지 않는다고 설명한다. 샘플은 정해진 덱과 500ms 의사결정 간격을 사용한다. 이는 예제 설정이지 실시간 공식 게임의 요구치나 M5 성능 측정값이 아니다. [Quickstart](https://royalegym.github.io/RoyaleGym/quickstart/)
- RoyaleGym 정확도 문서는 특정 엔진 버전·기본 카드 위주 경기 집합에서 측정했고, 평가 녹화가 비공개라 독자가 완전히 재현할 수 없으며 미측정 영웅/진화 등에 한계가 있다고 설명한다. 제시한 정확도를 전체 게임 재현 정확도로 확대하면 안 된다. [정확도와 한계](https://royalegym.github.io/RoyaleGym/accuracy/)
- CRForge는 Java 21 기반 시뮬레이터로 macOS 뷰어 실행 안내와 Python 학습 연계를 제공한다. 현재 README는 별도 게임 tables가 필요하며 자체 저장소에 해당 파일을 포함하지 않는다고 명시한다. 저자가 제공하는 정확도/속도 수치는 특정 버전·데이터의 보고이며 이번에 재현하지 않았다. [CRForge README](https://github.com/voonhous/crforge)
- MSU-AI/clash-royale-gym은 Gym 환경이지만 README가 초기판의 mock API 호출을 명시하고 설치 URL도 현재 저장소명과 다르다. 완성된 게임 엔진으로 바로 추천할 근거가 약하다. [README](https://github.com/MSU-AI/clash-royale-gym)
- Supercell Fan Content Policy는 오픈소스 코드의 라이선스와 별개로 캐릭터·그래픽·상표 등 Supercell Assets 사용을 제한하고, assets를 기반으로 새 게임을 만들거나 봇을 홍보하는 콘텐츠에 사용하는 것을 허용하지 않는다고 명시한다. OSS repo가 MIT/Apache라는 이유로 게임 assets까지 자유롭게 재배포할 수 있는 것은 아니다. [Fan Content Policy](https://supercell.com/en/fan-content-policy/)

### Inferences

- 우선 후보는 **RoyaleGym을 프로젝트별 Python 환경에 버전을 고정하여 짧게 검증**하는 것이다. Mac 설치 안내가 있다는 점은 장점이지만 CPU 학습 한계를 먼저 측정한다. 처음부터 대규모 self-play나 새 GPU 구매로 시작하지 않는다.
- 첫 도입 검사는 작은 battle smoke, 관측/행동 계약, seed 재현, 무작위 합법 행동/대기/단순 규칙 봇 대결이다. 라이선스·패키지의 데이터 출처를 확인하고, 공식 게임 그림 대신 자체 도형 시각화를 사용한다. 후보가 설치·데이터·동작 검사를 통과하지 못하면 제한된 카드와 규칙의 자체 미니 환경으로 개념을 검증한다. 이를 공식 게임과 동등한 복제품이라고 부르지 않는다.
- CRForge는 더 세밀한 simulator 비교가 필요할 때 후속 후보다. Java·별도 game tables·버전 동기화 부담 때문에 첫 도구를 두 개 동시에 도입하지 않는다. 게임 자산 수집·추출·사설 서버 연결은 이번 계획의 기본 경로에 넣지 않는다.
- 시뮬레이터의 승률은 그 시뮬레이터 안에서의 성적이다. 실제 게임 이전에는 동일 장면에서 공격 시점·이동·충돌·카드 배치의 차이를 확인해야 한다. 엔진의 허점을 학습하면 실제 게임에 옮길 때 무너질 수 있다.

### Gaps

- 실제 설치·시뮬레이터 실행·M5 CPU 처리량·학습시간은 미검증이다. 후보 프로젝트가 현재 Mac에서 충분히 빠른지, 선택 덱과 최신 게임 버전을 얼마나 충실히 지원하는지는 파일럿으로 확인해야 한다.
- 사용자 플레이 기기 미정이다. 안드로이드 폰 보유나 에뮬레이터의 Clash Royale 실행을 전제하지 않는다.

## AI가 보고 판단하고 행동하는 구조는 어떻게 나눌까

### Takeaway

**화면 인식 → 상태 추정 → 다음 행동 선택 → 허용 여부 검사 → 입력/시뮬레이터 적용 → 결과 확인**으로 분리한다. Qwen 파인튜닝을 배우려는 목적이라면 화면을 바로 넣기보다 구조화한 상태에서 짧은 행동 JSON을 고르도록 작은 모델의 LoRA를 실험한다. 작은 규칙·정책 모델을 비교 기준으로 유지한다.

### Cited Findings

- RoyaleGym 예제는 경기장·손패·엘릭서·시간을 관측하고, 대기 또는 손패 카드와 배치 타일 조합을 행동으로 둔다. 동일 덱 설정과 보상 조합·random/self 상대를 분리해 실험할 수 있다. [Quickstart](https://royalegym.github.io/RoyaleGym/quickstart/)
- Android ADB는 Mac 개발 장비에서 연결된 Android 기기와 통신하며 USB debugging과 사용자 허용이 필요하다. 공식 문서는 기기 화면 screenshot 수집을 설명하고, AOSP input 구현은 tap/swipe 명령을 제공한다. 이는 장치 조작 기능의 근거이며 특정 게임의 허가나 에뮬레이터 호환 근거는 아니다. [ADB](https://developer.android.com/tools/adb), [AOSP input source](https://android.googlesource.com/platform/frameworks/base/+/master/services/core/java/com/android/server/input/InputShellCommand.java)
- Android Studio/Emulator는 공식 Mac 요구사항에 Apple Silicon을 포함한다. 이 사실만으로 Clash Royale 앱의 설치·로그인·그래픽·게임 무결성 검사가 해당 emulator에서 통과한다고 결론내릴 수 없다. [Android Studio 설치](https://developer.android.com/studio/install)
- iOS에도 XCTest/XCUIAutomation screenshot 및 tap/swipe API가 있다. 따라서 “iPhone은 화면 수집/입력 API가 전혀 없다”는 설명은 틀리다. 이 문서가 App Store의 임의 게임을 간단히 자동 조작할 수 있음을 입증하는 것도 아니다. [XCUIScreenshot](https://developer.apple.com/documentation/xcuiautomation/xcuiscreenshot), [XCUIElement](https://developer.apple.com/documentation/xcuiautomation/xcuielement)

### Inferences

- 첫 구조는 `source → perception → state → policy → legal_actions → adapter → feedback`이다. source는 simulator state 또는 저장 영상, 마지막 adapter는 우선 simulator에만 연결한다. 같은 관측·행동 계약을 유지하면 이후 화면 인식과 장치 연결을 독립적으로 교체할 수 있다.
- 관측값은 자기 손패/엘릭서, 타워 HP, 시간, 양 팀 유닛 종류·위치·생존 상태, 관측 시각과 confidence다. 상대 손패/엘릭서는 실제 화면에 보이지 않는다면 과거 행동으로 추정하고 불확실성을 남긴다. 시뮬레이터가 아는 상대의 정확한 hidden state를 정책에 주면 실제 플레이로 이전할 수 없는 정보 누수가 생긴다.
- 첫 정책은 고정 덱·동일 레벨의 단순 규칙 봇이다. 그다음 소유/허락된 경기 데이터의 행동 모방 → 작은 정책 모델 → self-play 강화학습 순서가 좋다. “강화학습=처음부터 무작위로 수백만 번 돌리면 강해진다”가 아니다. 보상 설계·학습 데이터·상대 다양성이 중요하다.
- Minimax는 체스처럼 완전한 상태와 번갈아 행동하는 설정에서 이해하기 쉽지만, 이 게임은 동시 진행·숨은 정보·시간 지연이 있다. 우선 소수의 합법 행동 후보를 짧은 미래로 비교하는 제한 탐색부터 하고, 전체 게임을 정확히 읽는 minimax로 포장하지 않는다.
- Qwen에게 screenshot마다 긴 설명을 생성하게 하면 인식/생성 지연과 답의 불안정성이 행동 지연에 추가될 수 있다. Qwen의 한국어 경기 복기·설명 기능과 행동 선택기를 분리한다. 행동 선택기에는 짧은 상태 JSON을 주고 짧은 행동 JSON만 받으며, 설명은 경기 후 생성한다. 실시간 의사결정의 적합성은 작은 정책 모델과 실제 지연·정확도를 비교해 판단한다.
- Android 실기기 확보 시 Mac+USB ADB capture/input은 검토 가능한 후보다. Mac emulator는 Android 환경 구동과 실제 Clash Royale 호환을 별도 검증한다. iPhone은 signing·test runner·게임 접근 가능성 등 별도 실험이 필요하므로 첫 단계의 필수 장비로 지정하지 않는다. 장비 구매는 아직 권하지 않는다.
- action validator는 카드가 현재 손에 있는지, 비용을 감당하는지, 합법 위치인지, 이미 대기/처리 중인 행동인지, 화면이 실제 battle인지 검사한다. 오래된 프레임/낮은 confidence/연결 단절이면 대기한다. 재시도로 같은 카드를 두 번 누르지 않도록 실행 ID와 결과 확인을 둔다. 우선 저장 영상에서는 클릭을 실행하지 않고 선택할 행동만 기록하는 shadow mode로 검증한다.
- 공식 게임에서 실제 자동 플레이가 서비스 규정상 허용되는지는 별도 정책 근거를 적용한다. 기술적으로 입력이 가능하다는 사실과 운영상 허용은 다르다. 이번 작업은 계획만 작성하며 계정 로그인·온라인 경기·장치 입력은 수행하지 않는다.

### Gaps

- 특정 Apple Silicon emulator에서 최신 Clash Royale이 작동한다는 공식 검증 자료를 확보하지 못했다. iPhone의 서드파티 게임 자동화 호환성도 미검증이다.
- 탐지 모델과 학습 데이터 종류/권리/품질이 미정이며 OCR·겹친 유닛·HP 막대·배치 애니메이션의 오인식률도 미측정이다.

## Qwen LoRA를 연결할 공식 확장점은 있는가

### Takeaway

**RoyaleGym 관측·합법 행동 → 자체 JSON 변환기 → 작은 Qwen LoRA → 행동 JSON 검사 → simulator step**은 실행 가능한 설계 후보다. RoyaleGym이 Qwen/MLX를 기본 지원하는 것은 아니며 JSON 변환·학습 데이터 내보내기·정책 호출 bridge는 우리가 작성하고 검증할 부분이다.

### Cited Findings

- Observation builder는 player view의 `spatial`, `vector`, `action_mask`, `mask_planes`를 제공하고 사용자 정의 builder도 허용한다. 기본 builder는 상대 손패/엘릭서를 숨기고 공개된 행동에서 추정한다. 내부 state에는 hand, elixir, timer, tower HP, unit position 등이 있으므로 JSON 변환은 가능하지만 hidden state를 걸러야 한다. [Observation Builders](https://royalegym.github.io/RoyaleGym/clash-royale/configuration-objects/observation-builders/)
- Action parser는 기본 대기+손패 4장×타일 조합과 `action_mask`를 제공하며, custom action parser/외부 trainer를 사용할 수 있다. 자체 봇은 mask를 직접 적용해야 한다. [Action Parsers](https://royalegym.github.io/RoyaleGym/clash-royale/configuration-objects/action-parsers/)
- RoyaleImitate에는 human replay 재구성과 scripted/trained bot의 시범 기록 경로가 있다. 공식 문서는 공개 replay의 선수 수준을 알 수 없고, 규칙 봇 모방은 teacher의 한계를 그대로 가지며, replay state는 실제 기록된 화면이 아니라 시뮬레이터가 재구성한 상태라고 설명한다. [Cloning a Bot](https://royalegym.github.io/RoyaleGym/clash-royale/cloning-a-bot/)
- RoyaleGym 자체 trainer의 Mac CPU 실행 설명은 해당 trainer에 대한 내용이다. 이것을 외부 Qwen의 MLX LoRA까지 CPU만 가능하다는 의미로 확대할 수 없다. [RoyaleGym 설치](https://royalegym.github.io/RoyaleGym/install/)

### Inferences

- Qwen 학습 입력은 자기 hand/elixir, visible units/tower HP, timer, known played cards, opponent elixir estimate와 그 불확실성, 현재 합법 후보 행동으로 제한한다. simulator의 상대 정확한 hand/숨은 elixir/미래 state는 입력뿐 아니라 정답 행동을 만드는 teacher 경로에서도 누출되지 않는지 검사한다. action mask가 hidden information을 노출하는지도 확인한다.
- 전체 2305개 mask를 긴 문장으로 늘어놓기보다 작은 합법 후보 집합이나 명시적 좌표 범위를 구조적으로 제공한다. 출력은 `wait` 또는 `play`와 slot/x/y 같은 짧은 JSON만 요구한다. 후보를 줄이는 기준 자체가 정책 성능을 제한하므로 기준을 기록한다.
- 먼저 기본 Qwen(프롬프트만), 규칙 봇, 작은 전용 정책을 같은 상태 입력으로 평가한다. 그다음 시범 `(state, action)`을 Qwen chat JSONL 학습 형식으로 변환해 작은 LoRA 실험을 한다. 데이터 export와 chat-template 호환은 별도 검증 대상이며 RoyaleImitate artifact를 그대로 Qwen에 넣으면 된다고 하지 않는다.
- 규칙 봇 데이터는 형식·규칙 준수 학습과 연결 검증에 유용하지만 전문가 데이터는 아니다. 무작위 self-play 결과나 “승리한 경기의 모든 행동”도 자동으로 좋은 정답은 아니다. 좋은 행동/실수/대기 비율을 검토하고, 가능하면 적법한 인간 시범·검증한 강한 teacher로 품질을 높인다.
- 평가 데이터는 경기 단위 분리, heldout seed/상대/덱 조합으로 나눈다. 먼저 한 덱과 같은 레벨, 하나의 맵을 고정하고, 여러 맵을 실제 지원한다면 그때 unseen map도 별도 평가한다. 지원하지 않는 맵 일반화 시험을 한다고 쓰지 않는다.
- 핵심 비교는 fine-tune 전후의 승률, JSON parse 실패율, 불법 행동 비율, 결정 지연 p50/p95다. 대기만 하는 정책이 action accuracy를 높이지 않도록 카드 사용·엘릭서 낭비·게임 결과도 함께 본다. 가중치를 조정했다고 강해진 것은 아니다.
- simulator CPU 실행, RoyaleGym 내장 RL trainer, 외부 Qwen MLX 학습은 세 가지 별도 요소다. Qwen 모델 크기/양자화/LoRA 지원은 해당 모델 연구자의 확인을 적용한다. 첫 실험부터 27B screenshot end-to-end RL을 하지 않는다.
- 선택 기준: **Qwen을 직접 학습하고 언어 지시를 따르는 게임 에이전트 연구**가 목적이면 작은 Qwen LoRA가 적합한 실험이다. **가벼우면서 잘 싸우는 봇**이 목적이면 작은 전용 정책의 모방학습/RL이 더 직접적인 비교 후보이며 Qwen은 복기·설명을 담당할 수 있다.

### Gaps

- Qwen JSON bridge, MLX dataset converter, latency와 승률 개선은 아직 구현·측정하지 않았다. 공식 문서로 확장점의 존재만 확인했으며 모든 조합의 즉시 호환성을 보장하지 않는다.

## 검증 기준과 저장소 범위를 어떻게 잡을까

### Takeaway

초기 목표는 높은 랭크가 아니라 **상태를 잘못 읽지 않고 합법 행동을 선택하는 재현 가능한 봇**이다. 같은 모노레포에 창작 도구와 별도인 `projects/royale-lab`을 두고, Python 연구 앱과 평가 자료부터 시작한다.

### Cited Findings

- 현재 저장소는 독립 프로젝트를 `projects/<name>`에 두고, DB·환경·스토리지 분리와 앱 소유 테스트를 요구한다. 공통화는 실제 재사용이 입증될 때만 한다. [AGENTS.md](../../../AGENTS.md), [package.json](../../../package.json)
- 사용자 행동을 추가하는 경우 기존 이벤트 카탈로그 패턴, 클릭과 성공 구분, 키 없을 때 Amplitude 전송 생략, 개인정보/검색어/토큰 수집 금지가 요구된다. 이는 제품 흐름 측정 원칙이며 매 프레임의 연구 기록을 외부 제품 분석으로 보낼 이유가 아니다. [AGENTS.md](../../../AGENTS.md)

### Inferences

- 구조는 `projects/royale-lab/apps/agent` 아래 Python 인식·정책·환경 adapter와 해당 앱의 pyproject/lock/tests, `projects/royale-lab/docs`에 실험 기록과 출처로 시작한다. 창작 도구 `ai-studio`와는 데이터/실험/배포 주기가 달라 별도 프로젝트가 적합하다. 새 Git 레포는 당장 필요 없다.
- 외부 simulator의 큰 소스를 복사하지 않고 버전 고정 의존성을 사용한다. upstream 수정이 필요할 때만 fork한다. 모델 checkpoint·경기 원본·대형 dataset은 Git 밖에 두고 commit에는 데이터 manifest/출처·합성 fixture·평가 설정만 남긴다. Python이나 Java 의존성을 Yarn으로 바꾸지 않는다.
- 단계 A: 선택 덱/레벨/규칙을 고정하고 simulator random/noop/rule baselines와 저장·재현을 확인. 단계 B: 규칙 봇 또는 작은 모방 정책을 붙이고 학습에 쓰지 않은 seed/상대 조합에서 비교. 단계 C: 저장 영상을 손패·유닛·엘릭서/타워 상태로 변환하고 사람 라벨과 비교. 단계 D: shadow mode 전체 흐름 지연과 행동 합법성 검증. 단계 E: 실제 클라이언트 연결은 기기 호환과 규정 경계를 확인한 뒤 별도 결정.
- 데이터는 프레임을 무작위로 섞기보다 경기 단위로 train/test를 나눠 비슷한 연속 프레임이 양쪽에 새는 것을 피한다. 리플레이가 양쪽 hidden state를 보여줘도 실제 player view에서 볼 수 있는 정보만 정책 입력으로 만든다.
- 기록할 지연은 capture/전달→decode→인식→상태 갱신→정책→입력/결과 확인의 각 구간과 전체 p50/p95다. 평균 inference time만으로 실시간이라고 하지 않는다. 초기에 의사결정 간격을 500ms로 정한다면 그 간격 안에 전체 루프를 수행하는지 확인한다는 **실험 목표**이며 30fps나 특정 응답속도를 보장하지 않는다.
- 품질 지표는 상태 정확도(손패·엘릭서·유닛/위치), 불법 행동 비율, 중복 실행/잘못된 화면 입력, 오래된 관측으로 행동한 비율, seed 고정 재현, 기준 상대 대비 승률·타워 피해·엘릭서 낭비다. 경기 수·덱·레벨·상대·버전을 함께 기록하며 승률만 보고하지 않는다.
- 학습 비용은 simulator 처리량과 policy update 속도가 다르므로 각각 측정한다. Mac CPU에서 작은 환경/정책을 검증하고 학습이 실제 병목일 때만 NVIDIA cloud worker를 검토한다. 사용자에게 웹 서비스를 제공하는 계획이 아니라면 CDN·클라우드 API·분산 큐는 필요 없다.
- 새 대시보드를 만드는 경우에만 `experiment_start_clicked`와 실제 `experiment_started`, `evaluation_completed`처럼 사용자 흐름 이벤트를 앱 카탈로그에 설계한다. 원본 화면·플레이어 이름/태그·계정 정보는 보내지 않고, 내부 연구 지표는 로컬 평가 로그로 관리한다.

### Gaps

- 실행 테스트·성능 측정·계정 접근·코드 생성·커밋·push·배포는 이번 조사에서 수행하지 않았다. 현재 문서는 후보 도입 순서와 성공 기준이다.
