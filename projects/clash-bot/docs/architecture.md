# 실행과 학습 코드의 책임

Node는 브라우저·프로세스와 경기 순서를, Python은 모델 계산·시각 인식·네이티브 전투를 소유한다. 서로 다른 변경 이유를 가진 코드를 나누고, 통신·저장 형식은 [현재 계약만](../.agents/skills/current-code-only/SKILL.md) 읽는다.

```text
apps/agent/
  src/                         TypeScript 실행기 (의존 방향은 eslint.config.ts가 검사)
    core/                      실행 환경과 무관한 게임 규칙
      cards.ts, deck.ts        카드 정보와 미러전 덱
      geometry.ts, profile.ts  368×652 화면 좌표와 보정 프로필
      knowledge.ts             카드 수치·진화와 영웅 조건
      battle/                  FIFO, 엘릭서, 필드·생성물·진화 상태, 인식 결과와 상대 관찰 형식
      policy/                  합법 후보, Qwen 판단 계약(controller 1·3), 빠른 정책 특징·추론·후보(controller 4)
    counterpush/
      browser/                 전용 Chrome 캡처·입력·결과 판독
      perception/              인식 클라이언트, 손패·엘릭서·스킬 판독, 손패 참조 검증
      match/                   경기 한 판: 캡처·판단·입력 확인·기록
      learning/                저장된 기록의 상대 모방 자료·재인식·감사
      loop/                    후보 학습 → 고정 평가 → 채택, 학습 목표, 빠른 정책 실전(play)
    qwen/                      모델 사양·학습 클라이언트
    arena/                     자가대국 실행·Qwen 감독 자료 연결
    shared/                    데이터 경로, 파일, 실행 잠금, JSON 통신·Python 실행
  python/
    clash_bot/
      paths.py                 cwd와 모듈 깊이에 의존하지 않는 경로
      statistics.py            실전·자가대국의 정확 이항 검정
      qwen/
        protocol.py            Pydantic 입력 계약
        learning_worker.py     JSON 줄 단위 통신과 오류 복구
        runtime.py             상주 모델·후보·고정 평가 수명
        features.py            고정 특징과 마지막 MLP 어댑터 연결
        episodes.py            결과·사용 확인·학습 자료 검증
        learning_policy.py     LoRA, 목적 함수, 체크포인트
      arena/                   네이티브 전투·탐색·리그, 판단 문맥(context)·빠른 정책 특징(fast_features)·표본 검증(samples)
      perception/              CPU 인식·ONNX 변환
    requirements/              공통·모델·인식·변환·개발 의존성 고정
  contracts/                   양쪽 언어가 읽는 모델·규칙·판단·빠른 정책(fast-policy.json) JSON
  assets/counterpush/          계정 정보가 없는 시각 참조, 손패는 manifest로 검증해 직접 읽음
  test-fixtures/               녹화 화면·공유 계약 회귀 자료
  pyproject.toml               Python 직접 의존성·Ruff 설정
```

테스트는 구현 옆에 둔다. 공유 계약과 실제 그림을 `src`에서 분리해 두 언어가 같은 파일을 읽는다. Python 모듈은 `clash_bot.*`로 가져오며 `sys.path`를 바꾸지 않는다. Node의 `shared/python.ts`와 실행기가 `python -m`·`PYTHONPATH`·종료 신호·종료 코드를 처리한다. 설치 모듈은 가져오는 것만으로 설치·다운로드를 시작하지 않는다.

## 상태와 자원의 소유자

Counterpush 실행기 하나가 브라우저·CPU 인식 프로세스·큰 Qwen 본체를 소유한다. 빠른 정책(controller 4)은 Qwen 프로세스 없이 실행기 안에서 판단하며, 자가대국 리그가 게시한 챔피언 정책 파일을 읽기만 한다. 한 경기 동안 모델을 고정하고 경기 종료 후 확인된 입력과 결과로 학습한다. 실행 잠금과 중지 요청은 `shared/runtime-lock.ts`가 소유한다.

Python의 입력 형식 검증은 Pydantic(strict, 정의하지 않은 필드 거부), 가중치·경기 증거·모델 소유권 검증은 엔진이 담당한다. 잘못된 JSON 뒤에도 다음 정상 요청에 응답한다. 타입을 느슨하게 변환하지 않는다. 승격 확률은 SciPy의 단측 `binomtest`로 계산하며 무승부는 승리로 세지 않는다. 판정 방법·최소 쌍 수·평균 점수 하한·유의수준과 결과 라벨은 `contracts/qualification.json`을 따른다. SciPy 초기화는 실시간 추론 시작 경로에서 제외한다.

CPU 자가대국의 각 프로세스는 별도의 전장과 고정 정책을 갖는다. 경기 파일·학습·체크포인트 쓰기는 부모 실행기만 수행한다. macOS에서는 Metal을 사용한 프로세스를 복제하지 않고 `spawn`으로 최대 4개를 시작한다.

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

작업 공간을 옮길 때 `CLASH_BOT_DATA_DIR`로 기존 데이터 경로를, `CLASH_BOT_PYTHON`으로 기존 Python 실행 파일을 명시할 수 있다. Node(`src/shared/python.ts`)와 Python setup(`clash_bot.paths.QWEN_PYTHON`)이 같은 규칙을 사용한다. 중복 실행은 같은 데이터 경로 안에서만 막는다. 학습기는 `qwen/selfplay/lock.json`, 자가대국은 `arena/control/lock.json`을 쓰며, `qwen:setup`·`arena:setup`·`counterpush:setup`은 둘 중 하나가 실행 중이면 환경을 바꾸지 않는다. 서로 다른 데이터 경로를 쓰는 작업 공간끼리는 확인하지 않는다.

재개는 `evolution.json`, `candidate-learning.json`, `candidate-rehearsal.json`, `training-goal.json`이 담당한다. 구조 변경으로 학습 목표를 초기화하거나 기존 가중치를 덮어쓰지 않는다. 새 판단 계약이 필요할 때만 controller 버전을 올리고 실제 평가로 채택한다.
