# 실행과 학습 코드의 책임

Node는 프로세스·잠금과 트로피 경기 순서·자가개선 감독을, Python은 학습 계산·시각 인식·네이티브 전투를 소유한다. 화면 캡처와 입력은 Git 밖 로컬 어댑터가 맡는다. 서로 다른 변경 이유를 가진 코드를 나누고, 통신·저장 형식은 [현재 계약만](../.agents/skills/current-code-only/SKILL.md) 읽는다.

```text
apps/agent/
  src/                         TypeScript 실행기 (의존 방향은 eslint.config.ts가 검사)
    core/                      실행 환경과 무관한 게임 규칙 (기반 모듈 ← battle ← placement ← policy ← fast)
      cards.ts, deck.ts        카드 정보와 미러전 덱
      card-catalogue.ts        엔진 수치표로 만든 카드·필드 오브젝트 특징(contracts/card-catalogue.json)
      geometry.ts, profile.ts  368×652 화면 좌표와 보정 프로필
      knowledge.ts             카드 수치·진화와 영웅 조건
      battle/                  FIFO, 엘릭서, 필드·생성물·진화 상태, 인식 결과 형식
      placement/               배치 금지 구역과 좌표, 카드별 예측 배치(오두막·범위 주문 포함), 전투 예측
      policy/                  합법 후보, 판단 계약 decision-v3 직렬화, 타워 수비 보정
      fast/                    빠른 정책(controller 4): 특징(features), 가중치·추론(policy), 칸 단위 후보(candidates)
                               공유 전술 보정(tactics), 목표별 수비(defense), 상황별 배치(position-bias)
    arena/                     자가대국 Python 프로세스 실행·상태와 챔피언 정책 읽기(process.ts)
    trophy/                    내 실전 행동의 CPU 정책 수집·학습·고정 평가·채택, 시뮬레이터 챔피언 가져오기
    loop/                      자가개선 감독: 자가대국 유지, 챔피언 인계, 패치 확인, 보고
    shared/                    데이터 경로, 파일, 실행 잠금, JSON 통신·Python 실행, 공통 평가 수학
  python/
    clash_bot/
      paths.py                 cwd와 모듈 깊이에 의존하지 않는 경로
      runtime_setup.py         공용 실행 환경(.data/python/.venv) 설치
      runtime_guard.py         트로피 학습기·자가대국이 실행 중이면 설치를 거부
      channel.py               워커 프로세스가 Node와 공유하는 응답 통로(응답 외 출력은 오류 스트림으로)
      statistics.py            실전·자가대국의 정확 이항 검정
      combat_projection.py     빠른 정책 전술 보정이 쓰는 순수 이동·피해 예측
      layers_test.py           패키지 의존 방향 검사
      qwen/
        action_prior.py        Git 밖 화면 어댑터가 이름으로 실행하는 행동 사전 보정(serve). 경로를 옮기지 않는다
      arena/                   자가대국·탐색·리그 (의존: catalogue·placement ← sim ← tables ← policy ← training ← league ← commands ← cli)
        catalogue.py           카드 카탈로그 읽기(엔진 없이 동작)
        placement.py           배치 유형별 규칙 지점과 격자(엔진 없이 동작, TS 후보와 공유 사례로 일치)
        sim/                   학습이 실행하는 전투 환경: 고정 엔진·덱 풀·규칙 ID(rules), 한 경기(engine),
                               공개 엘릭서 장부(elixir), 배치 후보(candidates), 숨은 손패 가설과 판단
                               사이의 유지(belief), 학습 전 재현 검사(mechanics, verification)
        tables/                엔진 수치표 도구: 카탈로그 생성(catalogue_build, catalogue_vectors),
                               밸런스 패치 감시(balance)
        policy/                판단 문맥(context), 특징(features), 한 진영의 화면이 경기 동안 읽은 것(screen:
                               실전 장부와 같은 상대 엘릭서 상한 opponent_elixir, 인식 오류 noise),
                               표본(samples), 후보 축소의 고정 카드 분할(projection), 네트워크와 학습(network)
        training/              자가대국(selfplay), 탐색(search), 제한된 가치 기반 정책 개선(improvement),
                               화면·정규화가 일치하는 학습 행(targets), 실행 중 재사용하는 워커(parallel),
                               채택 평가(evaluation), 규칙 봇 기준 평가(benchmark), 경기 파일(storage)
        league/                실행 잠금·정지 요청·상태(control), 한 세대의 대국과 학습(generation),
                               채택 평가와 게시(qualification), 리그 포인터·체크포인트·실전 챔피언
                               파일(champions), 반복(loop)
        commands.py, cli.py    명령
      perception/              CPU 인식 워커(vision_worker)와 카드 식별(classifier)·유닛 표식(markers)·
                               독/무덤 효과(effects), 화면 실험(trophy_vision), ONNX 변환, 설치(setup)
      trophy/                  현재 궤적 계약, CPU PPO, 불변 체크포인트·시뮬레이터 정책 가져오기와 재시도 receipt
    requirements/              공통(core)·실행(runtime)·인식·변환·개발 의존성 고정
  contracts/                   양쪽 언어가 읽는 규칙·판단·빠른 정책(fast-policy.json)·카드 카탈로그(card-catalogue.json)·
                               트로피(trophy-learning.json)·감독(self-improvement.json) JSON
  assets/counterpush/          계정 정보가 없는 시각 참조(Counterpush 화면에서 만든 스프라이트·배지·표식)
  test-fixtures/               녹화 화면·공유 계약 회귀 자료
  pyproject.toml               Python 직접 의존성·Ruff 설정
```

테스트는 구현 옆에 둔다. 공유 계약과 실제 그림을 `src`에서 분리해 두 언어가 같은 파일을 읽는다. 같은 계산을 두 언어가 각각 구현한 곳(빠른 정책의 특징·추론과 배치 지점·격자, 전투 예측, 채택 통계)은 `test-fixtures/`의 공유 사례를 양쪽 검사가 함께 읽는다. Python 패키지는 아래 패키지만 가져오며 `clash_bot/layers_test.py`가, TypeScript는 `eslint.config.ts`가 검사한다. qwen에는 루트 모듈만 가져오는 `action_prior`만 남는다. Python 모듈은 `clash_bot.*`로 가져오며 `sys.path`를 바꾸지 않는다. Node의 `shared/python.ts`와 실행기가 `python -m`·`PYTHONPATH`·종료 신호·종료 코드를 처리한다. 설치 모듈은 가져오는 것만으로 설치·다운로드를 시작하지 않는다.

`assets/counterpush`, `.data/counterpush/detector`, `profiles/counterpush.json`의 이름은 Git 밖 어댑터가 읽는 경로라서 유지한다. `contracts/arena.json`의 `liveDeck: "counterpush"`와 `contracts/combat-projection.json`의 `counterpushCalibrated`는 바꾸면 `rulesID`가 바뀌어 새 리그가 시작되므로 유지한다. 두 묶음의 이름 변경은 [계획 문서](self-improvement-plan.md) 0단계의 후속 작업이다.

## 상태와 자원의 소유자

자가대국은 `arena start`가 시작한 Python 프로세스 하나가 리그·워커·체크포인트 쓰기를 소유하고, 잠금·정지 요청·상태는 `arena/league/control.py`가 `arena/control/`에 둔다. 트로피 실전은 Git 밖 화면 어댑터가 `trophy serve`로 연 `TrophySession`이 소유하며, 빠른 정책으로 판단한다. TS 실행(트로피·감독)의 잠금과 중지 요청은 `shared/runtime-lock.ts`가 소유한다.

Python의 입력 형식 검증은 Pydantic(strict, 정의하지 않은 필드 거부), 가중치·경기 증거·모델 소유권 검증은 엔진이 담당한다. 잘못된 JSON 뒤에도 다음 정상 요청에 응답한다. 타입을 느슨하게 변환하지 않는다. 승격 확률은 SciPy의 단측 `binomtest`로 계산하며 무승부는 승리로 세지 않는다. 판정 방법·최소 쌍 수·평균 점수 하한·유의수준은 `contracts/qualification.json`을 따른다. SciPy 초기화는 실시간 추론 시작 경로에서 제외한다.

CPU 자가대국의 각 프로세스는 별도의 전장과 고정 정책을 갖는다. 경기 파일·학습·체크포인트 쓰기는 부모 실행기만 수행한다. macOS에서는 Metal을 사용한 프로세스를 복제하지 않고 `spawn`으로 CPU 코어 수(최대 16개)까지 시작한다(`arena start --workers`). 워커는 실행을 시작할 때 한 번 만들어 자가대국과 채택 평가가 함께 쓴다. 평가 경기는 경기 ID로 시드가 정해져 워커 수와 무관하게 같은 결과를 낸다. 워커는 터미널 인터럽트를 무시하고 진행 중인 경기를 끝내며, 정지 여부는 부모 실행기가 판단한다.

트로피 자동개선은 `trophy/learning/control`의 잠금·상태·게시 포인터와 `experiments/<행동 지문>`의 상태·경기·가중치를 소유한다. 로컬 화면 어댑터는 검증한 로비에서 `nextMatch`를 받은 뒤 고정 `TrophyActor`로 행동하고, 확인한 입력/대기와 두 결과 화면을 `trajectory.json`으로 봉인한 다음 `complete`를 호출한다. `TrophySession`만 학습 순서·평가·게시를 변경한다. 학습기는 CPU MLX로 작은 빠른 정책만 갱신하며 arena 리그를 수정하지 않는다. 코드·계약·참조·입력 연결의 지문이 바뀌면 다른 실험으로 구분한다. 상태 조회는 `yarn workspace @side/clash-bot trophy status`, 외부 어댑터용 JSON 통신은 `trophy serve --seed <policy.json> --evidence <파일>`이다.

감독이 쓴 `simulation-candidate.json`은 평가가 없고 학습 묶음이 빈 상태에서 `nextMatch`가 읽는다. Python 학습기의 `import` 요청이 정책을 `imports/<가중치 SHA-256>/`에 PPO 체크포인트 번호와 별도로 저장하고, `trophy/simulation.ts`가 학습 중이던 PPO 후보를 보관한 뒤 같은 사전 등록 평가를 시작한다. 탈락하면 보관한 후보로 돌아가고, 이미 시도한 가중치는 `state.simulation.tried`에 남겨 다시 가져오지 않는다.

한 번 시작한 경기는 중복 학습하지 않는다. 봉인한 경기의 재개는 원본을 다시 검증하고, 봉인 전 중단된 경기는 제외한다. 불변 체크포인트 저장 뒤 receipt 연결 전에 중단되면 같은 갱신을 복구한다. 기존 읽기 전용 트로피 기록은 새 계약으로 변환하지 않는다. 세부 학습·채택 기준은 [학습 설계](learning-design.md#트로피-내-행동의-자동개선)를 따른다.

자가개선 감독은 `loop/control`의 잠금·상태·정지 요청과 `loop/` 아래의 사건(`events.jsonl`)·보고(`reports/`)·챔피언 사본(`simulation-champions/`)을 소유한다. 자신이 시작한 자가대국의 pid만 상태에 남겨 그 실행만 재시작·정지하며, 사용자가 직접 띄운 자가대국과 트로피 실행은 바꾸지 않는다. arena와 trophy는 서로 가져오지 않고, 감독이 쓰는 챔피언 사본과 인계 파일로만 이어진다.

## 실행과 개발 환경

직접 의존성은 `pyproject.toml`, 설치 시 전체 고정 버전은 `python/requirements/`가 소유한다. 공통 버전은 `core.lock` 한 곳에 두고 실행(`runtime.lock`)·인식·개발 설치가 재사용한다. Python은 Node 앱에 포함된 모듈이며 별도 배포 wheel로 취급하지 않는다.

```sh
yarn workspace @side/clash-bot python:setup
yarn workspace @side/clash-bot check:python
yarn workspace @side/clash-bot test:python
yarn workspace @side/clash-bot check
```

개발 도구와 GPU가 필요 없는 계약 검사는 별도 `.data/python-tools/`에서 실행한다. 실행 환경 `.data/python/.venv`를 변경하지 않는다. `test:python`은 Pydantic 통신·오류 복구, 공유 계약, 증거·격리 검사와 평가 통계를 검사하며 모델을 다운로드하지 않는다. 관련 변경 시 기존 필수 `Static analysis` 검사에도 포함된다.

실모델 검사는 따로 선택한다. `test:arena`, `test:perception`은 설치된 실행 환경을 사용한다. `test:perception:model`, `test:arena:model`은 각각 실제 CPU 인식·병렬 전투를 명시적으로 검사한다. 이 검사·예열 경기는 학습 경기 수에 더하지 않는다.

`test:trophy`는 모델 없는 궤적·선택 확률 계약을, `test:trophy:model`은 설치된 MLX로 CPU 기울기·실제 가중치 변경·KL 제한·체크포인트 보호·중복 갱신 복구를 검사한다. 임시 합성 경기로 실행하므로 실전 승리나 학습 경기 수에 넣지 않는다.

작업 공간을 옮길 때 `CLASH_BOT_DATA_DIR`로 기존 데이터 경로를, `CLASH_BOT_PYTHON`으로 기존 Python 실행 파일을 명시할 수 있다. Node(`src/shared/python.ts`)와 Python setup(`clash_bot.paths.RUNTIME_PYTHON`)이 같은 규칙을 사용한다. 중복 실행은 같은 데이터 경로 안에서만 막는다. 트로피 학습기는 `trophy/learning/control/lock.json`, 자가대국은 `arena/control/lock.json`, 감독은 `loop/control/lock.json`을 쓴다. `runtime:setup`·`arena:setup`·`perception:setup`은 트로피 학습기나 자가대국이 실행 중이면 환경을 바꾸지 않는다. 서로 다른 데이터 경로를 쓰는 작업 공간끼리는 확인하지 않는다.

## 킹타워 뒤 배치

`contracts/deployment.json`이 킹타워 중심과 뒤쪽 두 배치 지점을 소유한다. 화면 좌표 변환은 `core/geometry.ts`가 소유하며 TS 후보와 Python 자가대국이 같은 뒤쪽 타일을 사용한다. 킹타워 몸체는 계속 차단하고 뒤쪽 바닥을 손패 UI처럼 잘라내지 않는다.

빠른 정책과 자가대국의 규칙 지점은 카드당 최대 6개이며 뒤쪽 두 지점을 포함한다. 판단 시점에는 이 규칙 지점에 우리 진영의 모든 칸(유닛·건물·굴림 주문)과 필드의 두 칸마다·상대 유닛 위치(주문)를 더한 후보에 정책이 순위를 매긴다. 뒤쪽에 반드시 내도록 강제하지 않으며 개별 배치의 장기 효과를 따로 보상하지 않는다.
