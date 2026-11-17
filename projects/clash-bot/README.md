# Crown Bot

[Counterpush](https://playcounterpush.com/) 웹 게임을 전용 Chrome에서 화면만 읽어 플레이하고, 경기 결과로 Qwen 후보를 학습한 뒤 고정 평가를 통과한 후보만 적용하는 로컬 봇입니다. **Qwen3.8-27B 4bit**가 합법 배치 후보 중 다음 행동을 고르고, 로컬 자가대국(arena)이 수읽기 자료를 만듭니다.

Counterpush는 사용자가 지정한 참고 서비스이며 이 프로젝트에 Counterpush의 모델·게임 엔진은 포함되지 않습니다. 실제 클래시로얄 클라이언트의 자동 조작은 지원하지 않습니다. [Supercell 이용약관](https://supercell.com/en/terms-of-service/)이 봇·자동화 소프트웨어 사용을 금지합니다.

사용자가 설명한 필드 상황, 엘릭서 10 상한과 공유 재생, 8장 덱/4장 손패/FIFO, 카드별 역할과 구현 범위는 [학습 요구사항과 구조](docs/learning-design.md)에 있습니다.

## 설치

저장소 루트에서 Node 24, Yarn 4.17.0을 사용합니다. Qwen과 인식 모델은 Apple Silicon과 Python 3.11이 필요합니다.

```sh
yarn workspace @side/clash-bot qwen:setup
yarn workspace @side/clash-bot counterpush:setup
yarn workspace @side/clash-bot arena:setup
```

`qwen:setup`은 `.data/qwen/.venv`에 고정된 Python 의존성을 설치하고, 고정 revision의 Qwen3.8-27B 4bit(약 16.1GB)를 내려받아 모든 가중치 파일의 SHA-256을 검증합니다. 모델 사양은 `apps/agent/contracts/model.json` 하나를 TS와 Python이 함께 읽습니다.

`counterpush:setup`은 고정 revision·SHA-256의 카드 분류기와 박스 제안 모델을 내려받아 ONNX로 변환합니다. 원본 약 119MB와 변환본, 변환에만 쓰는 PyTorch 설치 공간이 추가로 필요합니다. 실시간 인식은 ONNX CPU 1스레드를 사용합니다. `arena:setup`은 같은 Python 환경에 고정 버전의 네이티브 전투 엔진을 설치합니다. 세 명령 모두 학습기나 자가대국이 실행 중이면 환경을 바꾸지 않습니다.

## Counterpush 플레이와 후보 학습

```sh
yarn workspace @side/clash-bot counterpush login
yarn workspace @side/clash-bot counterpush start --background --matches 0 --hours 0 --training-matches 8 --pairs 16
yarn workspace @side/clash-bot counterpush status
yarn workspace @side/clash-bot counterpush audit
yarn workspace @side/clash-bot counterpush stop
```

`login` 창에서 직접 로그인하고 양쪽 덱을 **GY GobHut Evo Furnace**로 설정합니다. 로그인은 일반 Chrome과 분리된 프로젝트 전용 프로필에 보존합니다. 시스템에 설치된 Google Chrome을 음소거해 사용하며 별도 Chromium을 내려받지 않습니다. 하루 제한이 있는 AI 복기 기능은 사용하지 않습니다.

`start --background`는 대화와 독립된 프로세스로 실행하고, `--matches 0 --hours 0`은 정지 요청까지 반복합니다. `stop`은 현재 경기와 학습을 마친 뒤 종료합니다. 로그인 만료·다른 덱·불명확한 결과·입력 미확인 반복·디스크 8GiB 미만이면 멈춥니다.

한 번의 반복은 다음 순서입니다.

1. 후보 학습 경기(`--training-matches`, 기본 8판)에서 실전 PPO·상대 모방·자가대국 자료를 별도 후보에만 학습합니다. 적용 모델(챔피언)의 어댑터는 고정합니다.
2. 고정한 챔피언과 후보를 쌍으로 대전시킵니다(`--pairs`, 최소 16쌍/32판). 평가 경기는 학습하지 않습니다.
3. 정확 쌍별 승리 검정을 통과한 후보만 원본 증거를 재검사해 적용합니다. 실패하면 기존 챔피언을 유지합니다.

평가가 중단되면 다음 `start`에서 같은 후보와 기록을 이어갑니다. `--training-goal 100 --training-matches 100`은 실전 100판의 학습 처리와 후속 평가를 끝낸 뒤 정지하며, 재시작해도 누적 수를 이어갑니다. 판정·복구·저장 규칙은 [자동 채택 정책](docs/arena-learning.md#검증을-통과한-qwen만-자동-채택), 속도와 100판 실행은 [1초 판단과 100판 학습](docs/fast-training.md), 패배 분석에 따른 후보 입력 변경은 [패배 원인과 학습 수정](docs/failure-learning.md)에 있습니다.

한 계정에서는 한 탭만 실행합니다. 2026-11-15 실제 화면에서 사이트가 다른 탭/창에서 게임을 시작하면 기존 경기를 닫는다고 안내했습니다. 결과가 확인되지 않은 경기는 학습하지 않습니다.

`audit`은 이번 실행 시작 이후 카드별 내 확인된 사용, 상대 발견, 행동 전 상태 포함, 학습 선별, 실제 가중치 학습 건수와 승패를 나눠 보여줍니다. 인식되지 않았거나 학습되지 않은 카드는 0으로 표시하며 승률 개선을 자동 선언하지 않습니다.

## 실시간 빠른 정책

자가대국 리그의 정책·가치 네트워크(약 82만 매개변수, 6×16 격자)는 화면으로 알 수 있는 판단 문맥(decision-v3)만으로 학습하고, 챔피언이 바뀔 때마다 실시간 실행용 `champion-policy.json`을 게시합니다. `counterpush play`는 이 정책으로 실제 Counterpush 경기를 controller 4로 둡니다. 판단은 실행기 Node 프로세스 안에서 하며 이 Mac에서 한 번에 약 0.14ms였습니다(후보 4개, 화면 판독 시간 제외). Qwen 모델을 올리지 않고 학습하지도 않으며, 경기 기록과 결과 한 줄을 `.data/counterpush/control/fast-play.jsonl`에 남깁니다.

```sh
yarn workspace @side/clash-bot arena start --background --hours 0
yarn workspace @side/clash-bot counterpush play --background --matches 20
yarn workspace @side/clash-bot counterpush status
yarn workspace @side/clash-bot counterpush stop
```

체크포인트에는 압축 가중치만 저장합니다. 다른 버전으로 두려면 `arena policy --version <번호>`로 리그의 `policies/v<번호>.json`을 만든 뒤 `--policy <파일>`로 지정합니다. 후보는 시뮬레이터의 합법 행동과 같은 규칙으로 카드별 최대 6곳을 만들며, 엘릭서 8 이상에서도 대기를 유지해 자원 보존과 사용을 비교합니다. 특징·추론·가중치 체크섬은 TypeScript와 Python이 같은 숫자를 내는지 `test-fixtures/fast-policy-cases.json`으로 검사합니다. 화면에서 아직 타워 체력을 읽지 않으므로 학습 표본의 절반에서 타워 체력을 가려, 타워 체력 없이도 판단하게 합니다.

자가대국 리그는 `.data/arena/leagues/<규칙 ID>-fast2`에 있습니다. 밸런스 패치로 규칙 ID만 바뀌면 새 리그는 직전에 실행한 리그의 챔피언 가중치에서 시작하고, 경기·리플레이·평가는 섞지 않습니다. 정책 형식이나 네트워크 구조가 바뀌면 이전 리그를 읽지 않고 처음부터 학습합니다. 실력은 자가대국 규모와 시뮬레이터·Counterpush 규칙 차이에 달려 있으며, 실전 우위는 Counterpush 경기 기록으로 따로 확인해야 합니다.

## 패배 원인 분석과 학습 곡선

```sh
yarn workspace @side/clash-bot counterpush report --last 50
```

`report`는 최근 경기 기록에서 확인할 수 있는 실수만 찾아 경기 폴더의 `loss-analysis.json`에 남기고, 판단 계약과 정책 버전별로 모아 보여줍니다. 승패와 평균 왕관 외에 다음을 셉니다.

- 엘릭서 10에서 보낸 시간과 그때 기다린 판단
- 상대 유닛이 2초 이상 우리 진영에 있었는데 엘릭서 3 이상을 갖고도 5초 안에 카드를 내지 않은 공격, 그 동안 기다린 판단
- 공격이 보인 뒤 첫 확인된 카드까지의 시간, 확인되지 않은 입력 비율, 판단 지연 중앙값

원인을 추측해 정답을 만들지 않고 판단 번호와 이유만 남깁니다. 승률이 0인 구간에서도 이 값들이 줄어드는지로 진척을 볼 수 있습니다. 원본 기록은 바꾸지 않습니다.

## 한 경기의 판단

1. 전용 Chrome 화면을 캡처해 저장소 손패 참조로 손패를, 막대 색으로 엘릭서를, CPU 인식 프로세스로 필드 유닛·효과를 읽습니다.
2. 4장 손패·8장 덱 FIFO·엘릭서·진화와 영웅 능력 상태를 추적하고 합법 배치 후보를 만듭니다. 후보(controller 3)는 무덤을 포함해 지불 가능한 모든 손패를 비교합니다.
3. 메모리에 상주한 Qwen이 후보마다 대응하는 토큰의 확률을 계산해 그 분포에서 하나를 고릅니다. 빠른 정책(controller 4)은 같은 판단 문맥으로 가장 높은 확률의 후보를 고릅니다. 후보 순서를 매번 섞어 첫 번째 토큰에 대한 편향을 줄이고, 대기 외에 합법 행동이 없으면 모델을 호출하지 않습니다. 챔피언은 자기 체크포인트의 판단 계약(controller 1)을, 후보는 짧은 공개 상태 입력(controller 3)을 씁니다.
4. 새 화면에서 같은 카드·충분한 엘릭서·대전 화면을 다시 확인한 뒤 입력하고, 손패 교체와 엘릭서 감소로 실제 사용을 확인합니다.
5. 결과 화면의 점수 라벨을 0.6초 간격으로 두 번 읽어 같을 때만 승패로 씁니다. Qwen이 추측한 승패는 쓰지 않습니다.

## Qwen 후보 학습 방식

학습 대상은 마지막 MLP 출력 투영 `language_model.model.layers.63.mlp.down_proj`에 해당하는 **rank 4 / alpha 8 LoRA, 90,112개 매개변수**입니다. 낮은 랭크의 변화량을 Qwen 내부에서 마지막 정규화 직전에 더하고, 원래 Qwen 출력층(`lm_head`)으로 합법 행동의 확률을 계산합니다. 마지막 층의 입력을 특징으로 저장하므로 전체 모델을 역전파하지 않고 이 변화량을 학습합니다. 원본 4bit 모델은 고정하고 어댑터를 별도 파일로 보존합니다.

선택 시점의 확률 분포와 정책 버전을 함께 저장하고, 같은 정책으로 고른 확인된 행동만 학습합니다. 보상은 승리 1 / 패배 -1 / 무승부 0이며, 실제 사용이 확인된 카드와 유효한 대기 행동 중 한 경기 최대 24개 지점에서 갱신합니다.

목적 함수는 [PPO](https://arxiv.org/abs/1707.06347)의 확률비 클리핑(0.8~1.2), 과거 경기의 지수 평균 기준 보상, 할인 0.995, 엔트로피 및 KL 항을 사용합니다. 초기 학습률은 0.00003, 기울기 크기는 0.5로 제한합니다. KL이 0.15를 넘으면 가중치와 Adam 상태를 복구하고 학습률을 1/4로 줄여 최대 네 번 시도하며, 계속 넘으면 그 갱신을 건너뜁니다. 비정상 수치·잘못된 버전·손상된 체크포인트는 적용하지 않습니다. 경기 전체의 희소 보상이므로 개별 행동이 패배 원인인지 판별하지는 못합니다.

## 상대 모방 자료와 다시 인식

상대 모방 자료는 자동 반복기가 경기마다 `observations.json`에서 만듭니다. 관찰은 경기 중 자동 추적한 상대 행동이며 행동 전후 화면의 캡처 시각, 행동 전 상황, 상대 카드와 화면 기준 왼쪽/오른쪽/중앙, 새 행동과 진영 확인 여부를 담습니다. 새 행동이 보이고 관찰 간격이 10초 이내이며 시각 확인 신뢰도 표시가 0.9 이상이고 행동 전 상황에 이후 정보가 없는 장면만 받아들입니다. 이 신뢰도는 선별 기준이며 통계적으로 보정된 확률이 아닙니다. 손패·엘릭서·정확한 배치 좌표는 미확인 값으로 두고, 근거가 부족한 장면은 `excluded`에 이유를 남깁니다.

자료 준비는 전후 화면을 368×652로 정규화하고 원본·학습 이미지의 해시와 후보·정답을 함께 저장합니다(`counterpush-mirror-actor-demonstrations-v4`). 후보의 Qwen 입력은 행동 전 상황을 짧게 줄인 문자열이며, 이후 화면은 정답 검증에만 씁니다. 상대 전체 덱의 후보는 행동 의도 목록이며 상대가 실제로 가진 손패라고 가정하지 않습니다. 검증된 패배 경기에서 승리한 같은 덱 상대를 BLUE 시점으로 반사해, 내 실전과 같은 행동 선택 과제로 학습합니다. 독·무덤·오두막과 1.2초 이내에 새로 관측한 얼법·용광로·기사·해골은 오차 영역에 들어가는 기존 후보가 있을 때 위치 영역도 학습합니다. 긴 관찰 간격과 통의 시전 위치를 알 수 없는 관측은 카드·방향 수준입니다. 숨은 손패는 ????이며 정확한 터치 좌표를 복원했다고 주장하지 않습니다.

학습은 후보 LoRA에 교차 엔트로피와 KL 제한을 적용하는 `mirror_actor_behavior_cloning`입니다. 최대 24장면, 한 번의 작은 갱신, 학습률 최대 1e-5, KL 상한 0.02를 적용하며 실패하면 가중치와 Adam 상태를 복구하고 작은 학습률로 재시도합니다. 상대의 승리를 PPO 승리 보상으로 복제하거나 모든 상대 행동이 최선이라고 가정하지 않습니다. 같은 자료의 해시는 다시 학습하지 않습니다. 학습된 장면의 확률 변화는 확인할 수 있지만 다른 상황의 전략 개선과 승률 향상은 고정 평가로만 판단합니다.

저장된 완료 경기를 다시 인식할 수 있습니다. `rescan`은 사이트에 접속하지 않고 원본 기록을 덮어쓰지 않으며, 경기 경로는 절대 경로로 지정합니다.

```sh
yarn workspace @side/clash-bot counterpush rescan /absolute/path/to/completed-run
```

결과 `reprocessed-observations.json`은 새로 발견한 사례이며 **학습하지 않은 자료**입니다.

## 손패 참조

손패 참조는 저장소의 `apps/agent/assets/counterpush/hand-templates`가 소유하며 실행 시 직접 읽습니다. `manifest.json`은 그림마다 카드, 상태(`normal`·`evolution`·`disabled`), SHA-256과 확인한 원본 프레임을 기록하고, 파일은 `<카드>.png` 또는 `variants/<카드>/<상태>-<번호>.png`로 둡니다. 해시가 다르거나 덱 카드의 참조가 없으면 실행을 시작하지 않습니다.

손패 참조를 추가하거나 바꾸면 manifest를 함께 고치고 `check`를 실행합니다. 검사는 모든 그림의 등재·해시·이름 규칙, 덱 8장의 일반·회색 그림(기록한 공백 제외), 각 그림이 같은 카드의 그림과 가장 가까운지를 확인합니다. 회색 카드는 위에 덮이는 밝은 영역이 카드 그림보다 지문을 크게 바꿔, 같은 프레임의 회색 고블린 오두막과 용광로가 같은 카드의 다른 그림보다 서로 더 가깝습니다. 이 5개 그림은 테스트에 인식 약점으로 기록했으며, 저장된 그림과 덮개 위치가 다른 회색 카드는 다른 카드로 읽힐 수 있습니다.

분석 좌표는 368×652이며 `profiles/counterpush.json`이 덱 8장, 손패 네 영역, 엘릭서 막대, 아레나 영역과 강 위치, 손패 인식 임계값을 소유합니다. 다른 프로필은 `--profile <경로>`로 지정합니다.

## 기록 위치

모든 실행 기록·모델·로그인 프로필은 Git에서 제외된 `.data`에 둡니다. 화면에는 계정·상대 닉네임이 포함될 수 있습니다.

| 경로                                               | 내용                                                                                                                                    |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `.data/counterpush/runs/<시각>/`                   | 판단 화면·프레임, `events.jsonl`, 인식·상태 기록, `observations.json`, `summary.json`, 결과 화면, 특징 파일, 학습 결과(`training.json`) |
| `.data/counterpush/control/`                       | 실행 상태, 재개 기록(`evolution.json`, `training-goal.json`), 전체 경기·채택 목록, 평가 기록                                            |
| `.data/counterpush/datasets/<지문>/`               | 상대 모방 자료와 그 학습 결과                                                                                                           |
| `.data/qwen/learning-3.8-27b/checkpoints/vNNNNNN/` | 챔피언 어댑터·Adam 상태·검증 정보. 모두 기록한 뒤 `current.json`을 교체                                                                 |
| `.data/arena/qwen/training/<id>/`                  | 학습 중인 후보 체크포인트                                                                                                               |
| `.data/qwen/selfplay/`                             | 학습 실행의 잠금과 중지 요청                                                                                                            |

특징 파일에는 고정된 Qwen의 마지막 MLP 입력과 정규화 전 상태를 저장합니다. 프로세스 재시작 시 원본 모델의 모든 가중치 파일과 어댑터를 검증합니다. 저장 파일은 현재 형식으로만 읽으며, 형식이 맞지 않으면 경로와 이유를 밝히고 멈춥니다.

## 자원과 한계

Qwen3.8-27B의 MLX 최대 메모리는 실제 경기 화면 세 장의 추론에서 약 **16GiB**였고, 모델 메모리 한도는 30GiB로 설정합니다. 실제 사용량을 미리 할당한다는 뜻은 아닙니다. 후보(controller 3)로 실행한 Counterpush 100판의 모델 판단 3,322개는 중앙값 **564ms**, 95백분위 **703ms**였습니다. 후보는 1초를 넘긴 판단을 입력하지 않습니다.

현재 덱은 진화 기사·진화 용광로·히어로 얼음 마법사까지 확인합니다. 기사/용광로 충전 횟수는 카드 FIFO와 별도로 추정하고, 얼음 마법사 스킬은 화면 버튼이 준비됐을 때 별도 2 엘릭서 행동으로 제공합니다. 버튼 변화·지출·손패 유지가 확인된 사용만 학습에 넣습니다. 상대 능력 사용 시점과 다른 챔피언의 개별 스킬 조작은 지원하지 않으며, 진화 주기의 실측 일치와 스킬 타이밍의 성능 향상은 검증하지 않았습니다. 전체 카드 능력·사거리·진화 상태·승리 조건을 모두 모델링하지는 않았습니다.

손패 애니메이션·화면 효과·색상 변화는 인식을 흐릴 수 있습니다. 후보를 제한해 잘못된 좌표를 줄였지만 좋은 전략을 보장하지 않습니다. LoRA의 실제 가중치 변경은 검증했고, 승률 향상은 고정 평가 게이트의 결과로만 판단합니다. 현재 판정은 이 덱과 Counterpush 상대에 대한 것입니다.

## 코드 구조와 검사

TypeScript 실행기, Python 계산 엔진, 공유 JSON 계약, 시각 자료를 분리했습니다. 위치와 상태 소유권은 [폴더 구조와 실행 경계](docs/architecture.md)에 있습니다. 코드·계약·저장 형식은 예전 버전 호환 없이 현재 형식만 다룹니다([current-code-only](.agents/skills/current-code-only/SKILL.md)).

```sh
yarn workspace @side/clash-bot python:setup
yarn workspace @side/clash-bot check
yarn workspace @side/clash-bot check:python
yarn workspace @side/clash-bot test:python
```

`check`는 lint·타입 검사·Vitest 단위 레인, `check:python`은 Ruff, `test:python`은 모델 없이 Pydantic 계약·공유 계약·증거 검사와 평가 통계를 실행합니다. `python:setup`은 개발 검사 전용 환경(`.data/python-tools/`)을 준비하며 Qwen 실행 환경을 바꾸지 않습니다. CI는 모델을 내려받지 않습니다.

설치된 실행 환경이 필요한 검사는 명시적으로 실행합니다.

```sh
yarn workspace @side/clash-bot test:learning
yarn workspace @side/clash-bot test:learning:model
yarn workspace @side/clash-bot test:perception
yarn workspace @side/clash-bot test:perception:model
yarn workspace @side/clash-bot test:arena
yarn workspace @side/clash-bot test:arena:model
yarn workspace @side/clash-bot test:integration
```

`test:learning`·`test:perception`·`test:arena`는 실모델 검사를 건너뜁니다. `test:learning:model`은 Qwen3.8-27B를 실제로 읽어 어댑터·캐시 학습·출력층 확률 비교와 가중치 갱신·재적용을 별도 임시 폴더에서 확인하며 운영 체크포인트를 바꾸지 않습니다. `test:perception:model`과 `test:arena:model`은 CPU 인식 모델과 병렬 전투를, `test:integration`은 Node → Python → ONNX CPU 인식 연결을 확인합니다. 자동 테스트는 실제 MLX 모델을 로드하지 않으며, 실제 경기의 판단·입력·승패는 자동 테스트와 구분해 기록합니다.

## 출처

- [Qwen3.8-27B](https://huggingface.co/Qwen/Qwen3.8-27B), [MLX 변환 모델](https://huggingface.co/mlx-community/Qwen3.8-27B-4bit)
- [MLX-VLM](https://github.com/Neywa-Labs/mlx-vlm)
- [LoRA 논문](https://arxiv.org/abs/2106.09685), [PPO 논문](https://arxiv.org/abs/1707.06347): 낮은 랭크의 가중치 갱신과 클리핑한 정책 경사 목적 함수의 참고 문헌.
- [SudhishNeel/clash-royale-detector](https://huggingface.co/SudhishNeel/clash-royale-detector): 카드 분류기 가중치를 고정 revision·SHA-256으로 내려받아 CPU에서 실행합니다.
- [ClashRoyaleBuildABot](https://github.com/Pbatch/ClashRoyaleBuildABot/tree/f89ecbf309e698cb9fccdfb64a6ff2a930e6541e): MIT 공개 프로젝트의 박스 제안 모델 `units_M_480x352.onnx`를 고정 revision·SHA-256으로 내려받습니다. 예전 클래스 이름은 카드 식별에 쓰지 않습니다. 라이선스는 `THIRD_PARTY_NOTICES.md`에 보존했습니다.

## 초기 조사 기록

- [AI 플레이 초기 계획과 조사](docs/research/ai-play/plan.md)
