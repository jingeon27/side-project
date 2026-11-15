# Crown Bot

Mac의 실제 클래시로얄 화면을 읽고 카드를 선택·배치하는 로컬 봇입니다. BlueStacks Air의 화면과 터치를 ADB로 연결하고, **Qwen3.8-27B 4bit**가 제한된 배치 후보 중 다음 행동을 고릅니다. 경기 결과로 LoRA 가중치를 갱신하고 다음 대전에 적용합니다. 더 가벼운 Qwen3.5-4B와 규칙 기반 실행 모드도 남겨두었습니다.

[Counterpush](https://playcounterpush.com/)는 사용자가 지정한 참고 서비스입니다. 이 프로젝트에 Counterpush의 모델·게임 엔진은 포함되지 않습니다.

현재는 **Counterpush AI와 전용 Chrome에서 자동 대전하면서 상대 행동을 학습**합니다. 사용자가 설명한 필드 상황, 엘릭서 10 상한과 공유 재생, 8장 덱/4장 손패/FIFO, 8장 각각의 역할과 확인한 구현 범위는 [학습 요구사항과 구조](docs/learning-design.md)에 보존했습니다. 학습 가중치 갱신과 실력 향상은 별도로 판단합니다.

## 현재 확인한 동작 — 2026-11-15

- Apple Silicon M5 Pro / RAM 48GB / macOS 26에서 BlueStacks Air **5.21.790.7505**, Android 13 ARM64로 실제 게임 로그인과 트로피 대전을 실행했습니다.
- 게임 **160635009**는 실행됩니다. `160635010`은 Google AVD와 BlueStacks 모두 초기 라이브러리 로드에서 `qkavrickk.T: 02` 예외로 종료됐고, `160635007`은 필수 업데이트 안내에 막혔습니다. 오류 `02`의 내부 의미는 확인되지 않았습니다.
- 009 설치 전 모든 APK 분할 파일의 서명을 Play Store 정식 앱 인증서와 비교했습니다. APK 패치나 기기 위장은 하지 않았습니다. 앱 설치 파일과 계정 데이터는 Git에 포함하지 않습니다. 향후 게임·서버 업데이트 후 호환성은 다시 확인해야 합니다.
- 기본 모델을 Qwen3.8-27B로 변경했습니다. MLX 변환본 revision `b935172e4bb5dcd0543774a34748fb92422e3027`과 세 가중치 파일의 SHA-256을 고정했습니다. 전체 파일 크기는 약 16.1GB입니다.
- 기존 Qwen3.5-4B 반복 실행은 경기와 학습을 마친 뒤 중지했습니다. 학습 버전 6은 `.data/qwen/learning`에 보존했고, 3.8은 `.data/qwen/learning-3.8-27b`에서 새로 학습합니다. 서로 다른 모델의 어댑터와 경기 특징을 섞지 않습니다.
- Qwen3.8을 실제 경기 화면 세 장에서 실행해 판단 시간 **1.32~1.65초**, MLX 최대 메모리 약 **16GiB**를 측정했습니다. 캡처·입력·후속 화면 확인 시간은 포함하지 않습니다. 승률 개선은 검증되지 않았습니다.
- 3.8 첫 트로피 경기에서 **입력 21회·카드 사용 확인 18회**, 유효한 대기를 포함한 **19개 판단의 학습과 버전 1 저장**을 확인했습니다. 경기 결과는 패배였습니다. 새 어댑터 해시는 `f8bce385007d702c8387d3612e7064f13acc7995c213d1c91647dfb9fc221681`이며, 이전 3.5 버전 6의 해시 `f7e062a18472cf53941b04fd4b6e7ee6b4d9ab8c56da0379b378bad3fb076792`는 그대로 보존됐습니다.

## 설치와 연결

저장소 루트에서 Node 24, Yarn 4.17.0을 사용합니다. Qwen 모드는 Apple Silicon과 Python 3.11이 필요합니다. Expo와 Android Studio를 실행할 필요는 없습니다.

```sh
yarn workspace @side/clash-bot setup
yarn workspace @side/clash-bot qwen:setup
```

`setup`은 작은 참조 이미지와 기본 프로필을 준비하며 기존 설정을 덮어쓰지 않습니다. `qwen:setup`은 `.data/qwen/.venv`에 고정된 Python 의존성을 설치하고, 고정 revision의 **3.8-27B** 모델을 내려받아 모든 가중치 파일의 SHA-256을 검증합니다. 모델 파일은 약 **16.1GB**이며 실행 메모리·Python 의존성·게임 기록은 별도입니다. `qwen:setup 4b`는 이전 3.5-4B(약 3.03GB)를 준비하며 `qwen:setup 2b`는 관찰용 소형 모델을 준비합니다. 모델 사양은 `apps/agent/src/qwen/models.json`에서 공유합니다.

BlueStacks에서 CPU 2개, RAM 2048MB, Balanced, 30 FPS를 설정했습니다. 로컬 ADB 접근을 켜고 BlueStacks를 완전히 종료 후 다시 엽니다. 현재 기기는 `127.0.0.1:5555`입니다. 원격 ADB 접근은 켜지 않습니다.

```sh
yarn workspace @side/clash-bot connect --adb /Applications/BlueStacks.app/Contents/MacOS/hd-adb
yarn workspace @side/clash-bot capture --adb /Applications/BlueStacks.app/Contents/MacOS/hd-adb --serial 127.0.0.1:5555
```

화면 캡처만 되고 `shell input`이 `error: closed`라면 ADB 접근 설정을 확인한 뒤, 완전 재시작하고 기존 연결도 다시 연결해야 합니다. 이 Mac에서는 BlueStacks 재시작만으로 기존 제한 연결이 풀리지 않았습니다.

```sh
/Applications/BlueStacks.app/Contents/MacOS/hd-adb disconnect 127.0.0.1:5555
yarn workspace @side/clash-bot connect --adb /Applications/BlueStacks.app/Contents/MacOS/hd-adb
```

진단 시 `hd-adb logcat`이 기기 대기를 반복하면 시간 제한을 두고 `hd-adb -s 127.0.0.1:5555 shell logcat -d -b crash`를 사용합니다. Google·Supercell 로그인은 사용자가 진행합니다.

## 자가학습 반복 실행

현재 Mac에는 실제 덱의 참조 이미지·프로필·로비 버튼 참조가 준비되어 있습니다. BlueStacks에서 클래시로얄을 열고 트로피 모드 로비에 둔 뒤 실행합니다. 다른 봇 실행과 동시에 사용하지 않습니다.

```sh
yarn workspace @side/clash-bot selfplay start \
  --model 3.8-27b \
  --adb /Applications/BlueStacks.app/Contents/MacOS/hd-adb \
  --serial 127.0.0.1:5555 --matches 0 --hours 8
```

`--matches 0`은 반복 실행이고 기본 최대 시간은 8시간입니다. 경기 수를 제한하려면 `--matches 2`처럼 지정합니다. 시간 제한이나 중지 요청은 이번 경기와 학습을 마친 뒤 적용합니다. 즉시 중지하려면 실행 터미널에서 `Ctrl+C`를 누릅니다. 즉시 중지한 경기는 확인된 결과가 없으면 학습하지 않습니다.

```sh
yarn workspace @side/clash-bot selfplay status
yarn workspace @side/clash-bot selfplay stop
```

`status`에는 진행 단계, 완료 경기 수, 학습 버전, 가중치 해시와 마지막 학습 결과가 표시됩니다. `stop`은 현재 경기와 학습을 끝낸 뒤 로비에서 멈춥니다. 다시 `start`하면 저장한 가중치와 Adam 상태를 읽고 이어갑니다. 이 명령은 실제 매칭과 입력을 실행합니다. 로비/결과 화면이 불명확하거나 남은 디스크가 8GiB 미만이면 새 경기를 시작하지 않습니다. 결과가 확인되지 않거나 학습에 오류가 나면 중단합니다.

기본값은 `--model 3.8-27b`입니다. `--model 4b`를 지정하면 보존된 3.5-4B 학습을 이어갑니다. 동시에 두 실행기가 게임을 조작하지 못하도록 잠금을 공유합니다.

3.8의 학습 대상은 마지막 MLP 출력 투영 `language_model.model.layers.63.mlp.down_proj`에 해당하는 **rank 4 / alpha 8 LoRA, 90,112개 매개변수**입니다. 낮은 랭크의 변화량을 Qwen 내부에서 마지막 정규화 직전에 더하고, 원래 Qwen 출력층으로 합법 행동의 확률을 계산합니다. 3.8은 입력 임베딩과 출력층이 분리되어 있어 `lm_head`를 사용합니다. 3.5-4B의 공유 임베딩 경로와 구별합니다. 마지막 층의 입력을 저장하므로 전체 모델을 역전파하지 않고도 이 변화량을 학습할 수 있습니다. 원본 4bit 모델은 고정하며 어댑터를 별도 파일로 보존합니다. 이 프로젝트의 전용 어댑터 형식이며 `selfplay` 학습 실행기로 읽습니다.

경기 중에는 합법 후보에 한 글자씩 붙여 Qwen의 확률 분포에서 선택하고, 그 분포와 학습 버전을 저장합니다. 후보 순서를 섞어 고정된 첫 번째 글자에 대한 편향을 줄입니다. 결과는 0.5초 간격의 두 화면에서 같은 왕관 수가 확인되어야 보상으로 사용합니다. 승리 1 / 패배 -1 / 무승부 0이며, 선택 시점이 같은 정책의 데이터만 학습합니다. 실제 사용이 확인된 카드와 유효한 대기 행동을 대상으로 한 경기 최대 24개 지점에서 업데이트합니다.

목적 함수는 [PPO](https://arxiv.org/abs/1707.06347)의 확률비 클리핑(0.8~1.2), 과거 경기의 지수 평균 기준 보상, 할인 0.995, 엔트로피 및 KL 항을 사용합니다. 초기 학습률은 0.00003, 기울기 크기는 0.5로 제한합니다. KL이 0.15를 넘으면 가중치와 Adam 상태를 복구하고 학습률을 1/4로 줄여 최대 네 번 시도합니다. 계속 한도를 넘으면 해당 업데이트를 건너뜁니다. 비정상 수치·잘못된 버전·손상된 체크포인트는 적용하지 않습니다. 이는 경기 전체의 희소 보상으로 시작하는 실험이며, 개별 행동이 패배 원인인지까지 판별하지는 못합니다.

벡터 DB는 사용하지 않습니다. 현재 학습에는 로컬 화면 특징·행동 확률·경기 결과 파일이면 충분합니다. 비슷한 과거 장면을 검색하는 기억 기능은 구현 범위에 포함하지 않았습니다.

## 학습 없는 Qwen 단일 경기

현재 Mac에는 실제 덱의 참조 이미지와 보정한 `.data/profile.json`이 준비되어 있습니다. 덱은 **용광로 / 얼음 마법사 / 기사 / 무덤 / 해골 병사 / 독 / 고블린 오두막 / 바바리안 통**입니다. 보정 좌표는 `profiles/bluestacks-trophy.json`에 보존했습니다. `counterpush:setup`은 이 8장의 계정 정보 없는 손패 참조를 준비하며 기존 사용자 참조를 덮어쓰지 않습니다.

이미 시작한 대전에서 실제 입력을 허용하려면:

```sh
yarn workspace @side/clash-bot qwen --model 3.8-27b \
  --adb /Applications/BlueStacks.app/Contents/MacOS/hd-adb \
  --serial 127.0.0.1:5555 --live --seconds 360 --max-actions 180
```

`--live`를 빼면 화면을 읽고 판단만 합니다. `Ctrl+C`로 중지하며 한 명령은 한 경기만 처리합니다. 실행 시간이나 입력 횟수가 먼저 끝나면 게임은 계속될 수 있으므로 결과를 확인합니다. 매칭 버튼을 자동으로 누르려면 `--start-match`를 추가합니다. 이 옵션은 `.data/qwen/lobby-button.png`와 현재 로비 버튼이 일치할 때만 동작하며, 현재 선택된 게임 모드를 시작합니다. 트로피 모드는 게임에서 미리 선택해야 합니다. 결과 화면의 재시작 버튼이나 상점은 자동으로 누르지 않습니다.

매칭 버튼 참조는 로비 캡처를 368×652로 정규화한 뒤 `(130,480,110,40)` 영역을 저장한 이미지입니다. 현재 Mac에는 준비되어 있으며 다른 UI에서는 다시 보정해야 합니다. 이전 이미지가 없거나 버튼이 다르면 매칭을 시작하지 않습니다.

판단 과정은 다음과 같습니다.

1. 작은 참조 이미지로 손패, 색으로 엘릭서와 적 체력 막대를 확인합니다. 일반·진화 카드 그림을 함께 지원합니다.
2. 식별된 카드 중 비용을 낼 수 있는 카드와 배치 후보를 만듭니다. 무덤은 상대 타워, 유닛은 내 진영을 후보로 제시합니다.
3. 메모리에 유지한 Qwen이 JSON 형식의 후보 번호 하나를 선택합니다.
4. 새 화면에서 같은 카드·충분한 엘릭서·게임 전면 상태를 재확인하고 입력합니다. 손패 교체와 엘릭서 감소를 별도로 기록합니다.
5. 결과 화면의 왕관 픽셀로 승패를 확인합니다. Qwen이 추측한 승패를 보상으로 사용하지 않습니다. 확인하지 못한 결과는 `unknown`, 보상은 `null`입니다.

`--seconds`는 1~600, `--max-actions`는 1~200입니다. 기본값은 각각 240초, 80회입니다. 모델은 한 프로세스에 유지되며 클라우드 API나 외부 추론 서버를 사용하지 않습니다.

## 기록과 자가학습의 범위

`.data/qwen/runs/<시각>/`에 다음 파일이 저장됩니다. 화면에는 계정·상대 닉네임이 포함될 수 있으므로 이 폴더 전체를 Git에서 제외합니다.

| 파일                 | 내용                                      |
| -------------------- | ----------------------------------------- |
| `NNNN.png`           | 판단에 사용한 실제 화면                   |
| `events.jsonl`       | 후보·Qwen 응답·입력·손패 교체·엘릭서 소모 |
| `result.png`         | 확인된 결과 화면이 있을 때 저장           |
| `summary.json`       | 입력/확인 횟수, 승패, 실행 시간           |
| `trajectories.jsonl` | 실제 배치가 확인된 행동과 경기 결과       |

`trajectories.jsonl`은 배치 확인 자료이며 내보내기 자체가 가중치를 바꾸지 않아 `weightsUpdated: false`를 유지합니다. 실제 자가학습 실행에는 `features/NNNN.npz`와 `training.json`이 추가됩니다. 특징 파일에는 고정된 Qwen의 마지막 MLP 입력과 정규화 전 상태를 저장하며, `training.json`에는 실제 갱신 여부·보상·학습률·확률 변화·전후 가중치 해시를 기록합니다. 경기 종료 후 `summary.json`에도 학습 결과를 반영합니다.

`.data/qwen/learning-3.8-27b/checkpoints/vNNNNNN/`에는 어댑터·Adam 상태·검증 정보를 함께 저장하고, 모두 기록한 뒤 `current.json`을 교체합니다. 3.5-4B의 기존 폴더는 `.data/qwen/learning`입니다. 프로세스 재시작 시 원본 모델의 모든 가중치 파일과 어댑터를 검증합니다. 3.8의 모델 식별자는 세 파일의 이름·SHA-256 목록을 합친 지문입니다. `.data/qwen/selfplay/`는 단일 실행 잠금·중지 요청·진행 상태를 소유합니다. 전체 모델·어댑터·원시 플레이 기록은 Git에 포함하지 않습니다.

## 인식 보정과 가벼운 모드

### Counterpush 상대 플레이 모방학습

Counterpush의 **실시간 대전 화면**에서 상대 행동을 자동 인식하며 Qwen으로 조작·학습·다음 대전을 반복합니다. 하루 제한이 있는 AI 복기 기능을 사용하지 않습니다. 전용 Chrome은 음소거하며 일반 Chrome 프로필과 분리합니다. 아래 명령은 저장소 루트에서 실행합니다.

```sh
yarn workspace @side/clash-bot qwen:setup
yarn workspace @side/clash-bot counterpush:setup
yarn workspace @side/clash-bot counterpush login
yarn workspace @side/clash-bot counterpush start --background --model 3.8-27b --matches 0 --hours 8
yarn workspace @side/clash-bot counterpush status
yarn workspace @side/clash-bot counterpush audit
yarn workspace @side/clash-bot counterpush stop
```

`login` 창에서 직접 로그인하고 양쪽 덱을 **GY GobHut Evo Furnace**로 설정합니다. 로그인은 프로젝트 전용 프로필에 보존합니다. 시스템에 설치된 Google Chrome을 사용하므로 별도 Chromium을 다운로드하지 않습니다. `--background`는 대화와 독립된 실행이고, `stop`은 현재 경기와 학습을 끝낸 뒤 종료합니다. 로그인 만료·다른 덱·불명확한 결과·3회 연속 입력 미확인·디스크 8GiB 미만이면 멈춥니다.

인식 준비는 고정 revision·SHA-256의 DINOv2 분류기와 박스 제안용 공개 모델을 다운로드합니다. 약 119MB의 원본 모델과 ONNX 변환본, 한 번의 변환용 PyTorch 설치 공간이 추가로 필요합니다. 실시간 인식은 ONNX CPU 1스레드를 사용합니다. 참조 스프라이트는 카드 종류 확인용이며 전략을 학습한 자료가 아닙니다.

`audit`은 **이번 실행 시작 이후** 카드별 내 확인된 사용, 상대 발견, 행동 전 상태 포함, 학습 선별, 실제 가중치 학습 건수와 승패를 분리해 보여줍니다. 인식되지 않은 카드나 학습되지 않은 카드는 0으로 표시하며 승률 개선을 자동 선언하지 않습니다. 전체 원본 경기 목록은 `.data/counterpush/control/matches.jsonl`에 계속 보존합니다.

추가 자료를 직접 준비하거나 저장된 완료 경기를 다시 인식할 수도 있습니다. `rescan`은 사이트에 접속하지 않으며 원본 기록을 덮어쓰지 않습니다. 명령의 경기 경로는 절대 경로를 사용합니다.

```sh
yarn workspace @side/clash-bot counterpush rescan /absolute/path/to/completed-run
```

이때 `reprocessed-observations.json`은 새로 발견한 사례이며 **아직 학습하지 않은 자료**입니다. 아래 명령으로 선별·학습할 수 있습니다. 내 행동의 과거 PPO 자료를 다시 학습하는 명령은 아닙니다.

```sh
yarn workspace @side/clash-bot opponent prepare --observations /absolute/path/observations.json
yarn workspace @side/clash-bot opponent train --dataset /absolute/path/dataset.json --model 3.8-27b
```

관찰 파일에는 상대 덱, 게임 영역, 행동 전후 화면, 각 화면의 남은 시간, 상대 카드와 화면 기준 왼쪽/오른쪽/중앙, 새 행동과 진영 확인 여부를 저장합니다. 새 행동이 보이고 관찰 간격이 10초 이내이며 시각 확인 신뢰도 표시가 0.9 이상인 장면만 받아들입니다. 이 신뢰도는 시각 주석의 선별 기준이며 통계적으로 보정된 확률이 아닙니다. 손패·엘릭서·정확한 배치 좌표는 미확인 값으로 유지하고, 진화 상태와 영웅 스킬 사용은 기본 카드 이름으로부터 추정하지 않습니다. 충분한 근거가 없는 장면은 `excluded`에 이유를 남깁니다.

`prepare`는 전후 화면을 368×652로 정규화하고 원본·학습 이미지의 해시와 후보·정답을 함께 저장합니다. Qwen 입력은 **행동 전 화면 한 장**이며, 이후 화면과 주석 설명은 정답 검증 자료로만 사용합니다. 상대 전체 덱의 후보는 행동 의도 목록이며 상대가 실제로 가진 손패라고 가정하지 않습니다. 상대가 위쪽에 있는 좌표계를 유지하고 화면의 좌우를 뒤집지 않습니다. 정답은 같은 카드·방향의 후보 확률을 합쳐 학습하므로 정밀 좌표를 가르치지 않습니다.

실제 학습은 기존 Qwen 내부 LoRA에 교차 엔트로피와 KL 제한을 적용하는 `coarse_opponent_behavior_cloning`입니다. 최대 24장면, 한 번의 작은 갱신, 학습률 최대 1e-5, KL 상한 0.02를 적용하며 실패 시 가중치와 Adam 상태를 복구하고 작은 학습률로 재시도합니다. 상대의 승리를 보상으로 복제하거나 그 행동이 최선이라고 가정하지 않습니다. 같은 자료의 해시를 다시 학습하지 않으며, 자가대전과 같은 잠금을 사용해 동시에 어댑터를 수정하지 않습니다.

자료는 `.data/counterpush/datasets/<지문>/`, 결과는 그 안의 `training.json`, 실제 가중치는 기존 모델별 체크포인트에 저장됩니다. 다음 `selfplay` 실행이 갱신된 버전을 읽습니다. 학습된 장면의 확률 변화는 확인할 수 있으나 다른 상황의 전략 개선과 승률 향상은 별도 검증이 필요합니다.

2026-11-15 카드 등록 정정: 실제 덱의 용광로가 사용자 참조 이미지에서 `minipekka`로 잘못 등록돼 있었습니다. 실제 프로필과 일반·진화 그림의 카드 ID를 `furnace`로 옮기고 원본을 `.data/backups/furnace-label-20261115`에 보존했습니다. 기본 입문 덱의 미니 P.E.K.K.A는 별도 카드로 유지합니다. 이전 3.8 체크포인트 v1~v6 및 그 기록은 수정하지 않았으며 해당 기록의 카드 이름에는 이 오류가 포함됩니다. 용광로는 이동하는 원거리 지원 유닛으로 취급합니다. 전체 카드 능력·사거리·진화 상태·영웅 스킬·승리 조건을 모두 모델링한 상태는 아닙니다.

첫 Counterpush 관찰 대전은 0–3 패배였습니다. 용광로 왼쪽 전개, 얼음 마법사 왼쪽 지원, 바바리안 통 왼쪽 압박의 세 장면을 모방학습해 **Qwen3.8 v6 → v7**을 저장했습니다. 무덤 오른쪽 공격은 화면 간격이 19초여서 제외했습니다. 갱신 전 해시는 `990d0fb4b90b592237d6234754122ce33f8760965f29a48bf85e3ee5ecf7e655`, 갱신 후 해시는 `5283f44749a4b2f703dc82657540db5683e0e1db291848704924a159b617de05`입니다. 선택 확률 평균은 약 1.3903% → 1.3995%로 소폭 변했으며, 이 값은 해당 학습 입력에서 정답 카드·방향을 고를 확률이지 승률이 아닙니다. 별도 프로세스로 v7을 다시 읽고 Qwen 내부 적용·같은 입력의 확률 재현·같은 자료의 재학습 거부를 확인했습니다. 자료와 확인 결과는 `.data/counterpush/datasets/995f2eb7ea78036f03c09db9/`에 보존했습니다. 실시간 플레이를 항상 Qwen이 조작한 것은 아니며 이번 브라우저 플레이와 화면 수집은 Codex가 수행했습니다.

초기 수동 관찰 단계의 검증: `yarn workspace @side/clash-bot check`의 타입 검사와 Vitest **49개**, `test:learning`의 Python **16개**가 통과했고 기존 실모델 통합 검사 1개는 일반 검사에서 건너뛰었습니다. 대신 운영 Qwen3.8으로 세 장면의 실제 모방학습과 별도 프로세스의 v7 재적용·확률 재현·중복 학습 거부를 직접 확인했습니다. Python 컴파일과 변경 파일의 포맷 검사도 통과했습니다. 실제 프로필에서 용광로 참조 3개가 읽히고 기존 미니 P.E.K.K.A 원본 이미지가 보존된 것을 확인했습니다. 브라우저 관찰 자료를 준비한 첫 명령은 상대 경로가 워크스페이스 기준으로 해석돼 실패했고 절대 경로로 다시 실행해 성공했습니다.

모든 분석 좌표는 368×652이고 실제 터치는 캡처 원본 크기로 변환합니다. `.data/profile.json`은 덱 8장, 손패 네 영역, 엘릭서, 대전 표시, 강과 아레나 영역을 소유합니다. 화면 비율이 다른 경우 원본 게임 영역을 지정합니다.

```sh
yarn workspace @side/clash-bot calibrate --viewport 0,0,1080,1920 --image /absolute/path/capture.png
yarn workspace @side/clash-bot learn --card knight --slot 1 --image /absolute/path/battle.png
yarn workspace @side/clash-bot learn --card knight --variant evolved --slot 1 --image /absolute/path/evolved.png
yarn workspace @side/clash-bot learn --marker --image /absolute/path/battle.png
```

`learn`은 카드/대전 표시의 **참조 이미지만 저장**하며 Qwen을 훈련하지 않습니다. 추가 그림은 `.data/templates/variants/<card>/<variant>.png`에 저장합니다. 선택한 손패 번호 1~4에 실제 해당 카드가 있는지 확인한 이미지로 등록합니다.

Qwen 없이 더 가볍게 실행하려면:

```sh
yarn workspace @side/clash-bot observe --adb /Applications/BlueStacks.app/Contents/MacOS/hd-adb --serial 127.0.0.1:5555 --seconds 30
yarn workspace @side/clash-bot play --adb /Applications/BlueStacks.app/Contents/MacOS/hd-adb --serial 127.0.0.1:5555 --seconds 180 --max-actions 30
```

규칙 모드는 기본 1초마다 분석하며 GPU 모델을 사용하지 않습니다. `observe`는 입력하지 않습니다. 이 모드에서는 매칭을 직접 시작합니다. `analyze --image <절대경로> --out <절대경로>`로 분석 영역을 그린 PNG를 확인할 수 있습니다.

## 자원과 한계

Counterpush의 현재 덱은 진화 기사·진화 용광로·히어로 얼음 마법사까지 확인합니다. 기사/용광로 충전 횟수는 카드 FIFO와 별도로 추정하고, 얼음 마법사 스킬은 화면 버튼이 준비됐을 때 Qwen의 별도 2 엘릭서 행동으로 제공합니다. 버튼 변화·지출·손패 유지가 확인된 사용만 학습에 넣으며 FIFO나 진화 횟수를 진행시키지 않습니다. 상대 능력 사용 시점과 다른 챔피언들의 개별 스킬 조작은 미지원입니다. 진화 주기의 Counterpush 실측 일치 여부, 스킬 사용 타이밍의 성능 향상은 아직 검증되지 않았습니다. 상세 상태와 출처는 [설계 기록](docs/learning-design.md)에 있습니다.

Qwen3.8-27B는 저장된 실제 경기 화면 세 장에서 추론 **1.32~1.65초**, MLX 최대 메모리 약 **16GiB**였습니다. 초기 실행과 화면 내용에 따라 달라지며, 캡처·재확인·터치·배치 확인 시간은 별도입니다. BlueStacks의 게스트 RAM 2GB는 Mac 전체 사용량의 상한이 아닙니다. 모델 메모리 한도는 3.8에 30GiB, 3.5에 12GiB로 설정합니다. 이는 실제 사용량을 미리 할당한다는 뜻이 아닙니다.

자가학습 실행기는 JSON 전체 생성 대신 합법 행동 토큰을 직접 평가합니다. 이전 3.5-4B 실전의 후보 선택은 보통 **0.25~0.45초**, MLX 최대 메모리는 약 **3.7GiB**였고 9개 지점의 학습은 약 **0.36초**였습니다. 모델 추론과 학습을 같은 프로세스에서 순차 실행합니다. 합법 행동이 하나뿐이면 추가 모델 추론을 생략합니다. 이 측정은 제한된 초기 경기이며 장시간 사용량 측정은 아닙니다.

체력 막대는 유닛 종류·공중/지상 상성을 판별하지 않습니다. 정확한 타워 체력, 상대 엘릭서, 챔피언 능력, 타워 파괴 후 확장 배치 영역도 지원하지 않습니다. 손패 애니메이션·스킨·화면 효과·색상 변화는 여전히 인식을 흐릴 수 있습니다. 후보를 제한해 잘못된 좌표를 줄였지만 좋은 전략을 보장하지 않습니다. LoRA의 실제 가중치 변경은 검증했으며, 학습 전후 승률 향상은 아직 측정하지 않았습니다. 경기 종결 보상만으로는 학습이 느리거나 성능이 나빠질 수 있습니다.

## 검증

```sh
yarn workspace @side/clash-bot check
yarn workspace @side/clash-bot test:learning
yarn workspace @side/clash-bot test:learning:model
yarn workspace @side/clash-bot test:perception
yarn workspace @side/clash-bot test:perception:model
python3.11 -m compileall -q projects/clash-bot/apps/agent/src/qwen
```

타입 검사와 앱 소유 Vitest로 인식·기기 선택·좌표 변환·전면 확인·오래된 응답 거부·손패 교체·비용 확인·합법 후보·실제 결과 화면의 보상 판정을 검증합니다. 자동 테스트의 기기는 가짜 기기이며 실제 MLX 모델은 테스트에서 로드하지 않습니다. 두 PNG 회귀 자료는 실제 게임 화면 중 계정 이름이 없는 영역만 남겼습니다. 실제 BlueStacks에서의 실행·배치·패배 결과는 위 실전 관찰이며 자동 테스트와 구분합니다.

Python 학습 검사는 양·음 보상에 따른 확률 방향, 가중치 변경, 체크포인트 재적용, 이전 정책/다른 모델/미확인 결과 거부, 모든 가중치 분할 파일 검증, 출력층 선택, 비정상 수치 복구와 KL 초과 시 작은 학습률 재시도를 확인합니다. 실전 기록과 자동 테스트를 구분하며, 학습에 따른 성능 개선은 검증하지 않았습니다.

Counterpush 반복 실행 경로의 추가 검증은 공유 재생·10 상한·4장 FIFO, 과거 상태의 미래 정보 누출 방지, 실제 엘릭서 막대, 지출 애니메이션, 레벨 표식 누락, 중복 유닛/효과, 기존 무덤의 새 묘비, 독의 진영, 연장전 결과와 실제 학습 건수 분리를 다룹니다. 잘못된 과거 사례는 격리 목록으로 자료 준비와 실제 학습에서 거부합니다. 자세한 자료 감사·모델 복구·구현과 미구현 구분은 [학습 설계](docs/learning-design.md)에 남깁니다. 타입 검사·Vitest 72개, Python 학습 19개(실모델 통합 1개 별도 건너뜀), CPU 인식 4개를 확인합니다. 실모델 전체 통합 검사는 이번 추가 변경에서 다시 실행하지 않았으며, 별도로 운영 Qwen3.8의 감사된 4사례 모방학습과 실제 가중치 변경을 확인했습니다. 인식 준비는 현재 캐시를 재사용해 SHA-256을 확인했고, 완전히 빈 환경의 최초 설치 전체는 이번에 재현하지 않았습니다.

`test:learning`은 일반 Python 검사이며 실제 모델 통합 검사를 건너뜁니다. `test:learning:model`은 기본으로 설치된 **Qwen3.8-27B**를 실제로 읽고 Qwen 내부 어댑터·캐시 학습·원래 출력층의 확률 비교와 실제 가중치 갱신·재적용을 별도 임시 폴더에서 확인합니다. `QWEN_TEST_MODEL=4b`로 이전 모델도 선택할 수 있습니다. 운영 중인 학습 체크포인트는 변경하지 않습니다.

2026-11-15 로컬 검사: 타입 검사·Vitest **44개**, Python **11개** 통과. 실제 모델 검사는 일반 Python 검사에서 별도로 1개 건너뜁니다. 3.8 실모델의 첫 출력층 비교는 BF16 가중치 복원 시 반올림 차이로 실패했고, FP32로 복원하도록 수정한 뒤 통합 검사에서 Qwen 내부 계산·캐시 학습·원래 출력층의 확률 비교와 가중치 변경·저장·재적용이 통과했습니다. 같은 통합 검사를 `QWEN_TEST_MODEL=4b`로 실행한 이전 모델 호환 검사도 통과했습니다. 기본 `qwen:setup` 명령의 다운로드 캐시 재사용과 세 파일 SHA-256 검증도 통과했습니다. 장시간 연속 운영과 승률 개선은 아직 검증하지 않았습니다.

## 이전 실행 오류와 대안

Google Android 12 ARM64 Play Store AVD는 실행기 31.3.14와 37.2.13 모두 게임 010에서 같은 시작 예외로 실패했습니다. 프로젝트 전용 AVD 준비 명령 `emulator`는 남아 있지만 현재 작동 경로는 BlueStacks + 009입니다. 기존 AVD와 공용 SDK는 변경하지 않습니다.

MuMu Mac은 [제조사의 게임 안내](https://www.mumuplayer.com/games/clash-royale-on-pc.html)와 [ADB 문서](https://www.mumuplayer.com/help/mac/connect-adb.html)가 있지만 설치·실행하지 않았습니다. [EasyFun](https://www.easyfun.gg/cloud-games/clash-royale-cloud-online.html)은 대기열까지만 확인했고 [CloudMoon](https://pc.cloudmoonapp.com/)은 로그인 전까지만 확인했습니다. 이 후보들의 게임 실행·봇 연결은 검증되지 않았습니다. [공식 Google Play Games PC 안내](https://supercell.com/en/news/clash-games-live-on-pc/)는 Windows 대상입니다.

## 출처

- [Android ADB](https://developer.android.com/tools/adb)
- [Qwen3.8-27B](https://huggingface.co/Qwen/Qwen3.8-27B), [MLX 변환 모델](https://huggingface.co/mlx-community/Qwen3.8-27B-4bit)
- [MLX-VLM](https://github.com/Neywa-Labs/mlx-vlm)
- [LoRA 논문](https://arxiv.org/abs/2106.09685), [PPO 논문](https://arxiv.org/abs/1707.06347): 낮은 랭크의 가중치 갱신과 클리핑한 정책 경사 목적 함수의 참고 문헌.
- [ClashRoyaleBuildABot](https://github.com/Pbatch/ClashRoyaleBuildABot/tree/f89ecbf309e698cb9fccdfb64a6ff2a930e6541e): MIT 공개 프로젝트의 초기 카드·대전 표시 이미지와 좌표를 사용했습니다. 다운로드 revision과 Git blob 해시를 고정하며 사용자 참조 이미지를 덮어쓰지 않습니다. 라이선스는 `THIRD_PARTY_NOTICES.md`에 보존했습니다.
