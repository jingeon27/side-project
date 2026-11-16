# 실행과 학습 코드의 책임

Node는 브라우저·ADB·프로세스와 경기 순서를, Python은 모델 계산·시각 인식·네이티브 전투를 소유한다. 서로 다른 변경 이유를 가진 코드를 나누고, 기존 Yarn 명령·통신 형식·`.data`와 모델 체크포인트는 보존한다.

```text
apps/agent/
  src/                         TypeScript 실행기
    android/
      device/                  ADB, 에뮬레이터
      perception/              실제 게임의 손패·체력·결과 판독
      policy/                  Android 입력 검증과 경량 정책
      runtime/                 한 경기·대전 반복 실행
      testing/                 Android 테스트 하네스
    game/                      두 실행 환경이 공유하는 카드 지식·배치 후보
    counterpush/
      runtime/                 브라우저와 한 경기
      domain/                  FIFO, 엘릭서, 필드·생성물·진화 상태
      perception/              인식 클라이언트, 손패·스킬 판독
      policy/                  합법 후보와 모델 입력
      learning/                경기 후 학습, 고정 평가, 채택·목표
    qwen/                      모델 선택·학습 클라이언트·공유 추론 연결
    arena/                     자가대국 실행·Qwen 감독 자료 연결
    trophy/                    Android 트로피 관찰 플레이
    shared/                    파일, 프로필, 실행 잠금, JSON 통신·Python 실행
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
      arena/                   네이티브 전투·탐색·리그
      perception/              CPU 인식·ONNX 변환
    requirements/              공통·모델·인식·변환·개발 의존성 고정
  contracts/                   양쪽 언어가 읽는 모델·규칙·판단 JSON
  assets/counterpush/           계정 정보가 없는 시각 참조
  test-fixtures/               녹화 화면·공유 계약 회귀 자료
  pyproject.toml                Python 직접 의존성·Ruff 설정
```

테스트는 구현 옆에 둔다. 공유 계약과 실제 그림을 `src`에서 분리해 두 언어가 같은 파일을 읽는다. Python 모듈은 `clash_bot.*`로 가져오며 `sys.path`를 바꾸지 않는다. Node의 `shared/python.ts`와 실행기가 `python -m`·`PYTHONPATH`·종료 신호·종료 코드를 처리한다. 설치 모듈은 가져오는 것만으로 설치·다운로드를 시작하지 않는다.

## 상태와 자원의 소유자

Counterpush 실행기 하나가 브라우저·CPU 인식 프로세스·큰 Qwen 본체를 소유한다. 한 경기 동안 모델을 고정하고 경기 종료 후 확인된 입력과 결과로 학습한다. 공유 실행 잠금은 `shared/runtime-lock.ts`가 소유하며 Counterpush가 Android 반복 실행기를 통해 잠금을 가져오지 않는다.

트로피 실행기는 별도 잠금·관찰 기록을 소유한다. 읽기 전용 후보 어댑터만 별도 보관하고 같은 Qwen 본체에서 순차 추론한 뒤 원래 학습 어댑터로 복귀한다. 공유 연결에는 학습·모델 선택·채택 명령을 노출하지 않는다. 학습·평가 중이거나 모델이 사용 중이면 요청을 쌓지 않는다. `read_only_external` 관찰은 학습 로더에서도 거부한다.

Python의 입력 형식 검증은 Pydantic, 가중치·경기 증거·모델 소유권 검증은 엔진이 담당한다. 잘못된 JSON 뒤에도 다음 정상 요청에 응답한다. 기본값·별칭·기존 유효 요청을 보존하며 타입을 느슨하게 변환하지 않는다. 승격 확률은 SciPy의 단측 `binomtest`로 계산하고 기존 무승부 처리·표본·유의수준 예산·원본 증거 조건을 유지한다. SciPy 초기화는 실시간 추론 시작 경로에서 제외한다.

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

작업 공간을 옮길 때 `CLASH_BOT_DATA_DIR`로 기존 데이터 경로를, `CLASH_BOT_PYTHON`으로 기존 Python 실행 파일을 명시할 수 있다. Node와 Python이 같은 설정을 사용한다. `.data/active-runtime.json`이 있으면 기존 프로세스의 소유 위치부터 확인하며 중복 학습기를 띄우지 않는다.

재개는 `evolution.json`, `candidate-learning.json`, `candidate-rehearsal.json`, `training-goal.json`이 담당한다. 구조 변경으로 학습 목표를 초기화하거나 기존 가중치를 덮어쓰지 않는다. 새 판단 계약이 필요할 때만 controller 버전을 올리고 실제 평가로 채택한다.

## 2026-11-16 구조 변경 검증

| 명령                                                                                                                                    | 결과                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `yarn workspace @side/clash-bot check`                                                                                                  | 타입 검사, Vitest 113개 통과·실제 CPU 모델 검사 1개 기본 생략 |
| `check:python`, `test:python`                                                                                                           | Ruff 67개 파일 통과, 모델 없이 계약·통계 검사 15개 통과       |
| `test:learning`                                                                                                                         | 51개 통과·전체 Qwen 모델 검사 1개 생략                        |
| `test:arena`, `test:perception`                                                                                                         | 각각 21개·5개 통과, 실제 모델 검사 각각 1개 기본 생략         |
| `test:arena:model`                                                                                                                      | 분리된 두 프로세스의 실제 전투 완료·합법 명령 확인            |
| `RUN_COUNTERPUSH_INTEGRATION=1 yarn workspace @clash-bot/agent vitest run src/counterpush/perception/vision-client.integration.spec.ts` | 새 Node → Python 모듈 → 기존 ONNX CPU 모델 연결 통과          |
| `yarn knip`, `yarn format:check`                                                                                                        | 미사용 검사·저장소 포맷 통과                                  |

실행 환경 검사는 기존 Python과 모델 경로를 명시했고 개발 검사는 독립된 도구 환경에서 수행했다. 이동 과정에서 드러난 그림·동적 가져오기·mock 경로를 수정한 뒤 재검사했다. 기존 CI 계약 검사 36개도 통과했다.

학습·캐시·전투·정책·탐색·자가대국 핵심 6개 파일은 import·포맷을 제외한 구문 트리가 기존과 같음을 확인했다. SciPy 확률은 기존 정확 이항 계산의 2,627개 승패 조합 및 128회 평가 예산 판정과 비교했다. 이번 변경에서 전체 27B 모델을 추가 로드하지 않았으며 기존 학습은 원래 실행 위치에서 계속했다. 코드 구조·검사 통과를 승률 향상으로 해석하지 않는다.
