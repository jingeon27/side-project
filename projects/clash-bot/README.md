# Crown Bot

실제 클래시로얄 트로피 경기를 화면만 읽어 두는 로컬 봇의 학습 코어입니다. 로컬 자가대국(arena)이 고정 버전의 전투 엔진으로 작은 정책·가치 모델을 학습하고, 트로피 자동개선이 확인된 내 실전 행동과 결과로 별도 CPU 정책을 학습해 고정 평가를 통과한 후보만 채택합니다. 자가개선 감독(`loop`)은 자가대국을 계속 돌리고 새 시뮬레이터 챔피언을 트로피 실전 평가에 넘깁니다.

화면 캡처와 입력(ADB) 연결은 저장소 밖 로컬 어댑터가 맡으며, 이 저장소의 명령은 실전 경기를 직접 시작하지 않습니다. 트로피 자동개선은 명시적으로 요청한 로컬 실험이며 자가대국과 실전의 학습·실력 평가를 구분합니다. Counterpush 웹 게임 실행과 Qwen 모델 학습 경로는 2026-11-20에 제거했습니다. 이후 단계는 [카드 스펙, 라벨링과 지속 자가개선 계획](docs/self-improvement-plan.md)을 따릅니다.

사용자가 설명한 필드 상황, 엘릭서 10 상한과 공유 재생, 8장 덱/4장 손패/FIFO, 카드별 역할과 구현 범위는 [학습 요구사항과 구조](docs/learning-design.md)에 있습니다.

## 설치

저장소 루트에서 Node 24, Yarn 4.17.0을 사용합니다. 실행 환경은 Apple Silicon과 `python3.11`이 필요합니다.

```sh
yarn workspace @side/clash-bot runtime:setup
yarn workspace @side/clash-bot arena:setup
yarn workspace @side/clash-bot perception:setup
```

`runtime:setup`은 `.data/python/.venv`를 만들고 `apps/agent/python/requirements/runtime.lock`(공통 `core.lock`과 MLX·OpenCV·Pillow)을 설치합니다. 자가대국·인식·트로피 학습이 이 환경을 함께 씁니다. 예전 `.data/qwen/.venv`는 읽지 않으므로 이미 쓰던 컴퓨터도 pull 후 한 번 실행합니다.

`arena:setup`은 같은 환경에 고정 버전의 네이티브 전투 엔진을 설치하고 엔진 수치표를 `.data/arena/rules/source/`에 둡니다. `perception:setup`은 고정 revision·SHA-256의 카드 분류기와 박스 제안 모델을 `.data/counterpush/detector/`에 내려받아 ONNX로 변환합니다. 원본 약 119MB와 변환본, 변환에만 쓰는 PyTorch 설치 공간이 추가로 필요합니다. 인식 워커는 ONNX CPU를 기본 1스레드로 사용합니다. 두 명령은 `runtime:setup`의 환경이 없으면 멈추고, 세 명령 모두 트로피 학습기나 자가대국이 실행 중이면 환경을 바꾸지 않습니다.

인식 자산과 모델 경로의 `counterpush` 이름(`apps/agent/assets/counterpush`, `.data/counterpush/detector`, `profiles/counterpush.json`)은 저장소 밖 어댑터가 읽으므로 그대로 두었습니다. 분석 좌표는 368×652이며 `profiles/counterpush.json`이 덱 8장, 손패 네 영역, 엘릭서 막대, 아레나 영역과 강 위치를 소유하고 core 배치 검사도 이 프로필을 읽습니다. 이 자산과 프로필은 Counterpush 화면에서 만든 것이라 실제 클래시로얄 화면에서의 인식 정확도는 측정하지 않았습니다. 다시 만드는 일은 계획 문서의 라벨링 단계에서 합니다.

## 자가대국과 빠른 정책

```sh
yarn workspace @side/clash-bot arena start --background --hours 0
yarn workspace @side/clash-bot arena status --summary
yarn workspace @side/clash-bot arena stop
yarn workspace @side/clash-bot arena benchmark
yarn workspace @side/clash-bot arena policy --version <번호>
```

`arena status`는 터미널에서 진행 단계, 완료한 경기 수, 후보와 챔피언 버전, 마지막 평가 결과를 표시합니다. 파이프 또는 `--json`은 전체 기록을 반환합니다. 상태 조회는 Python 표준 라이브러리만 사용합니다. 명령 전체와 판정 규칙은 [자가대국 구현 문서](docs/arena-learning.md)에 있습니다.

자가대국 리그의 정책·가치 네트워크(약 151만 매개변수)는 화면으로 알 수 있는 판단 문맥(decision-v3)만으로 학습합니다. 리그는 챔피언이 바뀔 때마다 실전용 `champion-policy.json`을 게시하고, 트로피 `serve --seed`와 자가개선 감독이 이 파일을 읽습니다.

- **입력(정책 형식 v4):** 카드와 필드 오브젝트를 이름 칸이 아니라 카드 카탈로그의 특징으로 읽습니다. 그래서 덱이 바뀌어도 가중치 모양이 같습니다. 필드는 두 타일 단위 격자(9×16)이고, 칸마다 오브젝트 특징과 화면에서 본 체력(최대 체력 대비)·이동 방향을 더합니다. 상대가 쓴 뒤 아직 손에 돌아오지 않은 카드, 내 진화 준비 상태도 넣습니다. 화면이 타워 체력을 늘 읽지는 못하므로 학습 표본의 절반은 타워 체력을 가립니다.
- **배치:** 후보는 배치 규칙 지점에 더해 우리 진영의 모든 칸(유닛·건물·굴림 주문)과 필드의 두 칸마다·상대 유닛 위치(주문)입니다. 카드 넷이면 수백 곳이 됩니다. 각 후보는 가장 가까운 적·위협까지의 거리와 방향, 범위 안의 적 수와 체력, 주변 아군, 양쪽 타워까지의 거리, 라인을 함께 읽습니다. 이 Mac에서 후보 754개로 후보 생성부터 추론까지 한 번의 판단이 약 7.2ms였습니다(화면 판독 시간 제외).
- **학습:** 자가대국은 1초마다 판단합니다. 정책이 매긴 후보 순위에서 16개를 Gumbel top-k로 뽑아(학습 중에는 순위가 낮은 칸도 탐색되도록) 탐색하고, 탐색하지 않은 후보 16개를 오답으로 함께 배웁니다. 학습 입력은 화면 인식 오류(유닛 누락·이름 모름·위치 오차·체력과 이동 미확인·효과 누락)를 넣은 사본으로 만들고, 탐색과 정답은 실제 경기를 씁니다.
- **실전과의 차이:** 경기마다 양쪽 입력 지연(18~26틱, 엔진이 실제 클라이언트에서 잰 값은 21~22틱)과 카드 레벨(±1)을 뽑습니다. 명령은 지연이 지나 실행될 때에만 상대에게 공개되고, 손패 가설도 그 시점에 맞춰 다시 만듭니다.
- **측정:** 채택 평가는 탐색 없이 입력 지연 22틱으로, 실전 덱 미러전과 다른 풀 덱 조합을 둡니다. 새 챔피언은 학습하지 않는 규칙 봇(무작위, 수비형)과 쌍으로 겨뤄 승률과 95% 구간을 `benchmarks/`에 남깁니다. 이전 챔피언 대비가 아닌 고정된 기준으로 실력이 오르는지 보기 위한 것이며, 사람이나 실제 클래시로얄 상대의 실력을 뜻하지 않습니다.

체크포인트에는 압축 가중치만 저장합니다. 다른 버전을 실전에 쓰려면 `arena policy --version <번호>`로 리그의 `policies/v<번호>.json`을 만든 뒤 `trophy serve --seed <파일>`로 지정합니다. 특징·추론·가중치 체크섬은 TypeScript와 Python이 같은 숫자를 내는지 `test-fixtures/fast-policy-cases.json`으로 검사합니다.

카드 카탈로그(`contracts/card-catalogue.json`)는 `arena catalogue`가 고정한 엔진 수치표로 만들며, 엔진이 시뮬레이션할 수 있는 카드 143장과 필드 오브젝트(유닛, 진화·영웅형, 주문 효과)의 0~1 특징, 레벨 11 최대 체력을 담습니다. 값은 클라이언트 표의 근거값이며 엔진의 정확한 전투 규칙은 아닙니다. 내용이 바뀌면 id(내용 해시)가 바뀌고, 실시간 실행은 다른 카탈로그로 학습한 정책 파일을 읽지 않습니다.

자가대국은 `contracts/arena.json`의 덱 풀(실전 덱과 11개 상대 덱)로 절반은 실전 덱 미러전, 나머지는 덱 조합을 둡니다. 실전 덱의 계약 키 이름은 `liveDeck: "counterpush"`이며, 바꾸면 `rulesID`가 바뀌어 새 리그가 시작되므로 그대로 두었습니다. 판단 간격·탐색 후보 수·입력 지연·레벨·인식 오류 비율도 같은 파일의 `selfplay`가 정합니다. 실전 덱을 바꾸려면 `liveDeck`과 덱 풀, 프로필의 덱 8장을 함께 바꿔야 하며, 판단 계약 decision-v3와 행동 사전 보정은 현재 덱의 카드 코드만 다룹니다.

자가대국 리그는 `.data/arena/leagues/<규칙 ID>-fast4`에 있습니다. 규칙 ID에는 카탈로그 id와 덱 풀도 들어갑니다. 밸런스 패치나 덱 풀·실전 덱 변경으로 규칙 ID만 바뀌면 새 리그는 직전에 실행한 리그의 챔피언 가중치에서 시작하고, 경기·리플레이·평가는 섞지 않습니다. 정책 형식이나 특징 목록이 바뀌면 이전 리그를 읽지 않고 처음부터 학습합니다. 이전 형식(`-fast2`, `-fast3`) 리그는 읽지 않으므로 v4 리그는 처음부터 학습합니다. 실력은 자가대국 규모와 시뮬레이터·실제 게임의 규칙 차이에 달려 있으며, 실전 우위는 트로피 실전 평가로 따로 확인해야 합니다.

## 트로피 자기 행동 자동개선

로컬 화면 연결은 `TrophySession`의 고정 경기 계획을 받아 현재 관측과 내 행동을 수집합니다. 확인된 새 학습 경기 2판마다 별도 작은 CPU 정책을 갱신하고, 기존 모델과 최소 16쌍의 고정 평가를 통과한 후보만 채택합니다. 이전 읽기 전용 기록·평가·미확인 입력을 학습으로 바꾸지 않습니다. 평가 중 학습을 멈추고 원본 화면·선택 확률·결과를 채택 전에 다시 검사합니다.

```sh
yarn workspace @side/clash-bot trophy status
yarn workspace @side/clash-bot test:trophy
yarn workspace @side/clash-bot test:trophy:model
```

`test:trophy:model`은 설치된 MLX 환경을 사용한 합성 자료 검사이며 실전 실력의 증거가 아닙니다. 로컬 화면 어댑터는 별도 ADB 연결·검토된 개인 화면 참조가 필요합니다. 학습 코어의 JSON 연결은 `trophy serve --seed <policy.json> --evidence <실행 파일>`이며 자세한 기록·수집·학습·평가 계약은 [트로피 학습 설계](docs/learning-design.md#트로피-내-행동의-자동개선)에 있습니다.

감독이 넘긴 시뮬레이터 챔피언(`.data/trophy/learning/control/simulation-candidate.json`)은 진행 중인 평가가 없고 학습 묶음이 비어 있을 때 다음 경기 계획을 만들면서 가져옵니다. 가중치는 PPO 체크포인트 번호와 별도로 `experiments/<행동 지문>/imports/<가중치 SHA-256>/`에 두고, 학습 중이던 PPO 후보를 보관한 채 같은 사전 등록 16쌍 실전 평가(같은 채택 기준·유의수준 지출)를 받습니다. 통과하면 트로피 챔피언이 되고 PPO가 그 가중치에서 이어 학습합니다. 탈락하면 보관한 PPO 후보로 돌아갑니다. 같은 가중치는 두 번 가져오지 않으며, 평가 보고서와 `lastEvaluation`에 후보 출처(`candidateSource`: `simulation` 또는 `own_play`)를 남깁니다.

## 자가개선 감독

```sh
yarn workspace @side/clash-bot loop start --background --keep-awake
yarn workspace @side/clash-bot loop status
yarn workspace @side/clash-bot loop stop
```

감독은 60초마다 점검합니다. 주기와 인자, 재시작 한도는 `contracts/self-improvement.json`이 정합니다.

- 자가대국이 돌고 있지 않으면 `arena start --hours 0 --games 4 --simulations 16 --depth 8 --pairs 16 --evaluate-every 2`를 nice 10으로 시작합니다.
- 자신이 시작한 실행이 실패하면 60·300·1800초 뒤 다시 시작하고, 6시간 안에 3번 실패하면 마지막 오류(`lastError`)를 남기고 멈춥니다. 그 실행이 `stopped`로 정상 종료하면 사용자의 정지로 보고 다음 `loop start`까지 다시 시작하지 않습니다. 감독이 시작하지 않은 자가대국은 멈추지 않습니다.
- 리그 챔피언의 버전이 0보다 크고 바뀌면 `champion-policy.json`을 `.data/loop/simulation-champions/<가중치 SHA-256>.json`으로 복사하고 트로피 인계 파일을 씁니다.
- 24시간마다 `arena rules`로 엔진·밸런스 변경을 확인해 사건으로 남깁니다. 새 표는 자동으로 활성화하지 않습니다.
- 24시간마다 `.data/loop/reports/YYYY-MM-DD-HHmm.json`에 자가대국·트로피 상태, 감독 상태, 지난 보고 뒤의 사건, 아직 자동화하지 않은 작업 목록(`notYetAutomated`)을 남깁니다. 보고서는 성적 향상을 판정하지 않습니다.

`--keep-awake`는 macOS `caffeinate -i -w <pid>`로 감독이 끝날 때까지 시스템 잠자기를 막습니다. `loop stop`은 정지 요청을 쓰고 SIGTERM을 보내며, 감독은 자신이 시작한 자가대국만 멈춘 뒤 종료합니다. 감독은 실전 트로피 경기를 시작하지 않습니다. 실전은 저장소 밖 ADB 화면 어댑터가 `trophy serve`로 둡니다.

## 기록 위치

모든 실행 기록·모델·Python 환경은 Git에서 제외된 `.data`에 둡니다. 화면에는 계정·상대 닉네임이 포함될 수 있습니다.

| 경로                                             | 내용                                                                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `.data/python/.venv/`                            | `runtime:setup`이 만든 실행 환경                                                                                                    |
| `.data/python-tools/`                            | `python:setup`이 만든 개발 검사 환경                                                                                                |
| `.data/counterpush/detector/`                    | `perception:setup`이 내려받은 분류기·박스 제안 모델, ONNX 변환본과 인식 참조                                                        |
| `.data/arena/control/`                           | 자가대국 잠금·상태·정지 요청, 현재 리그(`active.json`), 백그라운드 출력(`console.log`)                                              |
| `.data/arena/leagues/<규칙 ID 앞 16자>-fast4/`   | 경기·체크포인트·평가, `league.json`, 실전용 `champion-policy.json`, `policies/`, `benchmarks/`                                      |
| `.data/arena/rules/`, `.data/arena/vendor/`      | 고정 엔진 배포 파일과 수치표, 밸런스 확인·준비 결과                                                                                 |
| `.data/arena/verification/`                      | `arena verify` 결과                                                                                                                 |
| `.data/trophy/learning/control/`                 | 트로피 잠금·상태, 게시 포인터(`published.json`), 감독이 넘긴 `simulation-candidate.json`                                            |
| `.data/trophy/learning/experiments/<행동 지문>/` | 상태(`state.json`), 경기(`runs/`), 평가(`evaluations/`), PPO 체크포인트(`checkpoints/vNNNNNN/`), 가져온 시뮬레이터 정책(`imports/`) |
| `.data/loop/`                                    | 감독 잠금·상태(`control/`), 사건(`events.jsonl`), 보고(`reports/`), 넘긴 챔피언 사본(`simulation-champions/`)                       |

저장 파일은 현재 형식으로만 읽으며, 형식이 맞지 않으면 경로와 이유를 밝히고 멈춥니다. 예전 실행이 남긴 `.data/qwen/`, `.data/counterpush/runs/` 같은 기록은 현재 코드가 읽지 않으며, 지울지는 사용자가 정합니다.

## 코드 구조와 검사

TypeScript 실행기, Python 계산 엔진, 공유 JSON 계약, 시각 자료를 분리했습니다. 위치와 상태 소유권은 [폴더 구조와 실행 경계](docs/architecture.md)에 있습니다. 코드·계약·저장 형식은 예전 버전 호환 없이 현재 형식만 다룹니다([current-code-only](.agents/skills/current-code-only/SKILL.md)).

```sh
yarn workspace @side/clash-bot python:setup
yarn workspace @side/clash-bot check
yarn workspace @side/clash-bot check:python
yarn workspace @side/clash-bot test:python
```

`check`는 lint·타입 검사·Vitest 단위 레인, `check:python`은 Ruff, `test:python`은 모델 없이 Pydantic 계약·공유 계약·증거 검사와 평가 통계를 실행합니다. `python:setup`은 개발 검사 전용 환경(`.data/python-tools/`)을 준비하며 실행 환경(`.data/python/.venv`)을 바꾸지 않습니다. CI는 모델을 내려받지 않습니다.

설치된 실행 환경이 필요한 검사는 명시적으로 실행합니다.

```sh
yarn workspace @side/clash-bot test:perception
yarn workspace @side/clash-bot test:perception:model
yarn workspace @side/clash-bot test:arena
yarn workspace @side/clash-bot test:arena:model
yarn workspace @side/clash-bot test:trophy:model
```

`test:perception`·`test:arena`는 실모델 검사를 건너뜁니다. `test:perception:model`과 `test:arena:model`은 CPU 인식 모델과 병렬 전투를, `test:trophy:model`은 MLX CPU 기울기와 체크포인트 보호를 확인합니다. 자동 검사 결과와 실제 경기의 판단·입력·승패는 구분해 기록합니다.

## 출처

- [RoyaleSim](https://github.com/RoyaleGym/RoyaleSim): 자가대국 전투 엔진을 고정 버전으로 설치합니다. 출처와 라이선스는 `THIRD_PARTY.md`에 있습니다.
- [PPO 논문](https://arxiv.org/abs/1707.06347): 트로피 CPU 정책이 쓰는 클리핑한 정책 경사 목적 함수의 참고 문헌.
- [SudhishNeel/clash-royale-detector](https://huggingface.co/SudhishNeel/clash-royale-detector): 카드 분류기 가중치를 고정 revision·SHA-256으로 내려받아 CPU에서 실행합니다.
- [ClashRoyaleBuildABot](https://github.com/Pbatch/ClashRoyaleBuildABot/tree/f89ecbf309e698cb9fccdfb64a6ff2a930e6541e): MIT 공개 프로젝트의 박스 제안 모델 `units_M_480x352.onnx`를 고정 revision·SHA-256으로 내려받습니다. 예전 클래스 이름은 카드 식별에 쓰지 않습니다. 라이선스는 `THIRD_PARTY_NOTICES.md`에 보존했습니다.

## 초기 조사 기록

- [AI 플레이 초기 계획과 조사](docs/research/ai-play/plan.md)
