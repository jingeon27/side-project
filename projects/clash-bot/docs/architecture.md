# 실행과 학습 코드의 책임

Node는 브라우저·프로세스와 경기 순서를, Python은 모델 계산·시각 인식·네이티브 전투를 소유한다. 서로 다른 변경 이유를 가진 코드를 나누고, 통신·저장 형식은 [현재 계약만](../.agents/skills/current-code-only/SKILL.md) 읽는다.

```text
apps/agent/
  src/                         TypeScript 실행기 (의존 방향은 eslint.config.ts가 검사)
    core/                      실행 환경과 무관한 게임 규칙 (기반 모듈 ← battle ← placement ← policy ← fast)
      cards.ts, deck.ts        카드 정보와 미러전 덱
      card-catalogue.ts        엔진 수치표로 만든 카드·필드 오브젝트 특징(contracts/card-catalogue.json)
      geometry.ts, profile.ts  368×652 화면 좌표와 보정 프로필
      knowledge.ts             카드 수치·진화와 영웅 조건
      battle/                  FIFO, 엘릭서, 필드·생성물·진화 상태, 인식 결과와 상대 관찰 형식
      placement/               배치 금지 구역과 좌표, 카드별 예측 배치(오두막·범위 주문 포함), 전투 예측
      policy/                  합법 후보, Qwen 판단 계약(controller 1·3), 타워 수비 보정
      fast/                    빠른 정책(controller 4): 특징(features), 가중치·추론(policy), 칸 단위 후보(candidates)
    counterpush/
      browser/                 전용 Chrome 캡처·입력·결과 판독
      perception/              인식 클라이언트, 손패·엘릭서·스킬 판독, 손패 참조 검증
      match/                   경기 한 판: 캡처·판단·입력 확인·기록
      learning/                저장된 기록의 상대 모방 자료·재인식·감사
      evaluation/              고정한 두 모델의 사전 등록 비교, 평가 실행, 실행 동작 해시
      loop/                    후보 학습 → 고정 평가 → 채택의 순서, 학습 목표, 빠른 정책 실전(play)
    qwen/                      모델 사양·학습 클라이언트
    arena/                     자가대국 실행·Qwen 감독 자료 연결
    trophy/                    내 실전 행동의 CPU 정책 수집·학습·고정 평가·채택, 로컬 입력 연결과 분리
    shared/                    데이터 경로, 파일, 실행 잠금, JSON 통신·Python 실행, 공통 평가 수학
  python/
    clash_bot/
      paths.py                 cwd와 모듈 깊이에 의존하지 않는 경로
      channel.py               워커 프로세스가 Node와 공유하는 응답 통로(응답 외 출력은 오류 스트림으로)
      statistics.py            실전·자가대국의 정확 이항 검정
      layers_test.py           패키지 의존 방향 검사
      qwen/                    이름으로 실행하는 진입점과 계약은 폴더 바로 아래에 둔다
        learning_worker.py     JSON 줄 단위 통신과 오류 복구(Node가 실행)
        action_prior.py        명시적 사전 보정과 읽기 전용 관찰자용 진입점(serve)
        protocol.py            Pydantic 입력 계약
        setup.py, download.py, model_specs.py   설치와 모델 사양
        qualification.py       채택 기준 계약 읽기
        inputs/                모델이 받는 것: 판단 프롬프트(decision_input), 전투 예측(combat_projection),
                               고정 머리말 캐시(text_prefix), 고정 특징과 캐시(features, feature_cache)
        learning/              가중치가 바뀌는 방식: LoRA·확률·손실(learning_policy), 체크포인트와 Adam
                               상태(learner), PPO·상대 모방·수읽기 증류(policy_gradient, imitation,
                               search_distillation), 배경 학습 부하(training_budget)
        records/               플레이한 것과 학습 가능한 것: 경기 증거(episodes, episode_events), 상대
                               시범(opponent_data), 수읽기 감독 자료(search_data), 재생(replay)
        adoption/              챔피언 교체 전 원본 증거 재검사와 게시(promotion)
        worker/                상주 모델 프로세스: 적재와 추론(runtime), 어댑터 역할 전환(adapter_roles),
                               실전·수읽기 학습 요청(game_training, search_study)
      arena/                   자가대국·탐색·리그 (의존: catalogue·placement ← sim ← tables ← policy ← training ← study ← league ← cli)
        catalogue.py           카드 카탈로그 읽기(엔진 없이 동작)
        placement.py           배치 유형별 규칙 지점과 격자(엔진 없이 동작, TS 후보와 공유 사례로 일치)
        sim/                   학습이 실행하는 전투 환경: 고정 엔진·덱 풀·규칙 ID(rules), 한 경기(engine),
                               공개 엘릭서 장부(elixir), 배치 후보(candidates), 숨은 손패 가설과 판단
                               사이의 유지(belief), 학습 전 재현 검사(mechanics, verification)
        tables/                엔진 수치표 도구: 카탈로그 생성(catalogue_build, catalogue_vectors),
                               밸런스 패치 감시(balance)
        policy/                판단 문맥(context), 특징(features), 한 진영의 화면이 경기 동안 읽은 것(screen:
                               실전 장부와 같은 상대 엘릭서 상한 opponent_elixir, 인식 오류 noise),
                               표본(samples), 네트워크와 학습(network)
        training/              자가대국(selfplay), 탐색(search), 실행 한 번 동안 재사용하는 워커(parallel),
                               채택 평가(evaluation), 규칙 봇 기준 평가(benchmark), 경기 파일(storage)
        study/                 자가대국 장면으로 만드는 Qwen 감독 자료(curriculum, teacher, export)
        league/                실행 잠금·정지 요청·상태(control), 한 세대의 대국과 학습(generation),
                               채택 평가와 게시(qualification), 리그 포인터·체크포인트·실전 챔피언
                               파일(champions), 반복(loop)
        cli.py                 명령
      perception/              CPU 인식 워커(vision_worker)와 카드 식별(classifier)·유닛 표식(markers)·
                               독/무덤 효과(effects), 화면 실험(trophy_vision), ONNX 변환
      trophy/                  현재 궤적 계약, CPU PPO, 불변 체크포인트와 재시도 receipt
    requirements/              공통·모델·인식·변환·개발 의존성 고정
  contracts/                   양쪽 언어가 읽는 모델·규칙·판단·빠른 정책(fast-policy.json)·카드 카탈로그(card-catalogue.json) JSON
  assets/counterpush/          계정 정보가 없는 시각 참조, 손패는 manifest로 검증해 직접 읽음
  test-fixtures/               녹화 화면·공유 계약 회귀 자료
  pyproject.toml               Python 직접 의존성·Ruff 설정
```

테스트는 구현 옆에 둔다. 공유 계약과 실제 그림을 `src`에서 분리해 두 언어가 같은 파일을 읽는다. 같은 계산을 두 언어가 각각 구현한 곳(빠른 정책의 특징·추론과 배치 지점·격자, 전투 예측, 채택 통계)은 `test-fixtures/`의 공유 사례를 양쪽 검사가 함께 읽는다. Python 패키지는 아래 패키지만 가져오며 `clash_bot/layers_test.py`가, TypeScript는 `eslint.config.ts`가 검사한다. qwen은 계약 ← `inputs` ← `learning` ← `records` ← `adoption` ← `worker` ← 진입점 한 방향이다. Python 모듈은 `clash_bot.*`로 가져오며 `sys.path`를 바꾸지 않는다. Node의 `shared/python.ts`와 실행기가 `python -m`·`PYTHONPATH`·종료 신호·종료 코드를 처리한다. 설치 모듈은 가져오는 것만으로 설치·다운로드를 시작하지 않는다.

## 상태와 자원의 소유자

Counterpush 실행기 하나가 브라우저·CPU 인식 프로세스·큰 Qwen 본체를 소유한다. 빠른 정책(controller 4)은 Qwen 프로세스 없이 실행기 안에서 판단하며, 자가대국 리그가 게시한 챔피언 정책 파일을 읽기만 한다. 한 경기 동안 모델을 고정하고 경기 종료 후 확인된 입력과 결과로 학습한다. 실행 잠금과 중지 요청은 `shared/runtime-lock.ts`가 소유한다.

Python의 입력 형식 검증은 Pydantic(strict, 정의하지 않은 필드 거부), 가중치·경기 증거·모델 소유권 검증은 엔진이 담당한다. 잘못된 JSON 뒤에도 다음 정상 요청에 응답한다. 타입을 느슨하게 변환하지 않는다. 승격 확률은 SciPy의 단측 `binomtest`로 계산하며 무승부는 승리로 세지 않는다. 판정 방법·최소 쌍 수·평균 점수 하한·유의수준과 결과 라벨은 `contracts/qualification.json`을 따른다. SciPy 초기화는 실시간 추론 시작 경로에서 제외한다.

CPU 자가대국의 각 프로세스는 별도의 전장과 고정 정책을 갖는다. 경기 파일·학습·체크포인트 쓰기는 부모 실행기만 수행한다. macOS에서는 Metal을 사용한 프로세스를 복제하지 않고 `spawn`으로 CPU 코어 수(최대 16개)까지 시작한다(`arena start --workers`). 워커는 실행을 시작할 때 한 번 만들어 자가대국과 채택 평가가 함께 쓴다. 평가 경기는 경기 ID로 시드가 정해져 워커 수와 무관하게 같은 결과를 낸다. 워커는 터미널 인터럽트를 무시하고 진행 중인 경기를 끝내며, 정지 여부는 부모 실행기가 판단한다.

트로피 자동개선은 `trophy/learning/control`의 잠금과 `experiments/<행동 지문>`의 상태·경기·가중치를 소유한다. 로컬 화면 어댑터는 검증한 로비에서 `nextMatch`를 받은 뒤 고정 `TrophyActor`로 행동하고, 확인한 입력/대기와 두 결과 화면을 `trajectory.json`으로 봉인한 다음 `complete`를 호출한다. `TrophySession`만 학습 순서·평가·게시를 변경한다. 학습기는 CPU MLX로 작은 빠른 정책만 갱신하며 Counterpush Qwen·arena 리그를 수정하지 않는다. 코드·계약·참조·입력 연결의 지문이 바뀌면 다른 실험으로 구분한다. 상태 조회는 `yarn workspace @side/clash-bot trophy status`, 외부 어댑터용 JSON 통신은 `trophy serve --seed <policy.json> --evidence <파일>`이다.

한 번 시작한 경기는 중복 학습하지 않는다. 봉인한 경기의 재개는 원본을 다시 검증하고, 봉인 전 중단된 경기는 제외한다. 불변 체크포인트 저장 뒤 receipt 연결 전에 중단되면 같은 갱신을 복구한다. 기존 읽기 전용 트로피 기록은 새 계약으로 변환하지 않는다. 세부 학습·채택 기준은 [학습 설계](learning-design.md#트로피-내-행동의-자동개선)를 따른다.

## 실행과 개발 환경

직접 의존성은 `pyproject.toml`, 설치 시 전체 고정 버전은 `python/requirements/`가 소유한다. 공통 버전은 `core.lock` 한 곳에 두고 모델·인식 설치가 재사용한다. Python은 Node 앱에 포함된 모듈이며 별도 배포 wheel로 취급하지 않는다.

```sh
yarn workspace @side/clash-bot python:setup
yarn workspace @side/clash-bot check:python
yarn workspace @side/clash-bot test:python
yarn workspace @side/clash-bot check
```

개발 도구와 GPU가 필요 없는 계약 검사는 별도 `.data/python-tools/`에서 실행한다. 모델 실행 환경 `.data/qwen/.venv`를 변경하지 않는다. `test:python`은 Pydantic 통신·오류 복구, 공유 계약, 증거·격리 검사와 평가 통계를 검사하며 모델을 다운로드하지 않는다. 관련 변경 시 기존 필수 `Static analysis` 검사에도 포함된다.

실모델 검사는 따로 선택한다. `test:learning`, `test:arena`, `test:perception`은 설치된 실행 환경을 사용한다. `test:learning:model`, `test:perception:model`, `test:arena:model`은 각각 실제 Qwen·CPU 인식·병렬 전투를 명시적으로 검사한다. 이 검사·예열 경기는 학습 목표에 더하지 않는다.

`test:trophy`는 모델 없는 궤적·선택 확률 계약을, `test:trophy:model`은 설치된 MLX로 CPU 기울기·실제 가중치 변경·KL 제한·체크포인트 보호·중복 갱신 복구를 검사한다. 임시 합성 경기로 실행하므로 실전 승리나 학습 경기 수에 넣지 않는다.

작업 공간을 옮길 때 `CLASH_BOT_DATA_DIR`로 기존 데이터 경로를, `CLASH_BOT_PYTHON`으로 기존 Python 실행 파일을 명시할 수 있다. Node(`src/shared/python.ts`)와 Python setup(`clash_bot.paths.QWEN_PYTHON`)이 같은 규칙을 사용한다. 중복 실행은 같은 데이터 경로 안에서만 막는다. 학습기는 `qwen/selfplay/lock.json`, 자가대국은 `arena/control/lock.json`을 쓰며, `qwen:setup`·`arena:setup`·`counterpush:setup`은 둘 중 하나가 실행 중이면 환경을 바꾸지 않는다. 서로 다른 데이터 경로를 쓰는 작업 공간끼리는 확인하지 않는다.

재개는 `evolution.json`, `candidate-learning.json`, `candidate-rehearsal.json`, `training-goal.json`이 담당한다. 구조 변경으로 학습 목표를 초기화하거나 기존 가중치를 덮어쓰지 않는다. 새 판단 계약이 필요할 때만 controller 버전을 올리고 실제 평가로 채택한다.

## 킹타워 뒤 배치

`contracts/deployment.json`이 킹타워 중심과 뒤쪽 두 배치 지점을 소유한다. 화면 좌표 변환은 `core/geometry.ts`가 소유하며 TS 후보와 Python 자가대국이 같은 뒤쪽 타일을 사용한다. 킹타워 몸체는 계속 차단하고 뒤쪽 바닥을 손패 UI처럼 잘라내지 않는다.

Qwen은 카드당 최대 5개 후보 안에 뒤쪽 선택지를 유지하고 전방·중앙·수비 후보도 비교한다. 빠른 정책과 자가대국의 규칙 지점은 카드당 최대 6개이며 뒤쪽 두 지점을 포함한다. 판단 시점에는 이 규칙 지점에 우리 진영의 모든 칸(유닛·건물·굴림 주문)과 필드의 두 칸마다·상대 유닛 위치(주문)를 더한 후보에 정책이 순위를 매기고, 규칙 지점만 쓰는 곳은 탐색의 안쪽 수와 Qwen 전술 자료다. 뒤쪽에 반드시 내도록 강제하지 않으며 개별 배치의 장기 효과를 따로 보상하지 않는다.
