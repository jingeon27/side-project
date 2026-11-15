# Story Studio Python engine

한국어 원고·음성·영상 생성과 음성 QLoRA 학습을 담당하는 독립 Python 앱입니다. 웹 화면은 형제 `web` 앱이 담당합니다. Apple Silicon의 Python 3.11에서 실행하며 `pyproject.toml`이 Python 패키지와 고정 의존성의 기준입니다.

## 설치와 실행

기본 설치는 저장소 루트에서 `yarn workspace @side/story-studio local:setup`을 실행합니다. 웹 설치 도구가 전용 가상환경에 이 패키지의 `apple-silicon` 추가 의존성을 설치하고 고정 revision의 공개 모델을 준비합니다. 기존 `.data`와 `STORY_STUDIO_DATA_DIR`는 그대로 사용합니다.

웹과 같은 작업은 이 앱 폴더에서 다음처럼 독립 실행할 수 있습니다. 가상환경과 데이터 경로는 실제 설치 위치로 바꿉니다. `--examples-dir`는 읽을 수 있는 공개 예시 폴더를 명시합니다.

```sh
PYTHONPATH=src ../web/.data/local/.venv/bin/python -m story_studio \
  --data-dir ../web/.data --examples-dir ../web/public/examples <<'JSON'
{"action":"voice","text":"안녕하세요. 한국어 목소리 테스트입니다.","settings":{"kind":"preset","speaker":"sohee","style":"calm"}}
JSON
```

Python 패키지를 설치한 환경에서는 `story-studio-worker`도 같은 진입점입니다. 모델 설치 진입점은 `python -m story_studio.setup` 또는 `story-studio-setup`입니다. 작업 실행은 외부 생성 API를 호출하지 않습니다.

## 패키지 구성

```text
src/story_studio/
  worker.py             실행 진입·작업 분기·GPU 잠금
  runtime.py            작업별 진행·상태·취소·정리
  generation/           한국어 글·음성·영상 생성
  voices/
    samples.py          녹음 검증·정규화
    jobs.py             데이터 검증·학습 실행·완료 가중치 로드
    training.py         MLX QLoRA 계산·옵티마이저·체크포인트
    store.py            음성 실행·체크포인트 경로
  assets.py             개인 자산·공개 예시 경로
  storage.py            원자적 비공개 JSON 저장
  media.py              ffmpeg·자막·영상 합치기
  setup.py              모델 설치·변환
  catalog.py            패키지에 포함된 모델 설정 읽기
  models.json           고정한 모델 저장소와 revision
```

생성 함수는 전달받은 입력과 진행 콜백을 사용합니다. 진행 상태와 취소는 작업별 `JobContext`가 소유하며 전역 사전으로 공유하지 않습니다. 테스트는 담당 구현 옆에 두고, 실제 모델이 필요한 계산은 해당 작업에서만 불러옵니다.

## 계약과 수명

표준 입력으로 JSON 요청 하나를 읽고 표준 출력에 줄 단위 JSON 진행 상태와 결과를 씁니다. 모델 진단은 표준 오류로 분리합니다. 모델 하나를 사용하는 프로세스가 `local/gpu.lock`을 소유하며 작업 후 프로세스 종료로 모델 메모리를 반환합니다. 영상 합치기·녹음 정규화처럼 모델을 쓰지 않는 작업은 GPU 잠금을 점유하지 않습니다.

데이터 저장 위치는 전달받은 `--data-dir`가 결정합니다. 자산은 `assets`, 영상 상태는 `tasks`, 녹음은 `voices`, 학습 상태와 체크포인트는 `voice-training/runs`에 남습니다. 폴더 이동이 아니라 코드 소유권을 분리하는 변경이므로 기존 실행과 완료된 가중치를 그대로 조회·재개합니다. 인증·HTTP·사용자 화면의 정책은 웹이 소유합니다.

## 검증

```sh
yarn workspace @story-studio/engine check
```

모델 없이 import·작업 상태 저장 계약을 검사합니다. Apple Silicon MLX 추가 의존성이 없으면 네이티브 학습 검사만 명시적으로 건너뜁니다. 실제 학습·재개 결과 일치는 엔진 앱 폴더에서 전용 가상환경으로 실행합니다.

```sh
PYTHONPATH=src ../web/.data/local/.venv/bin/python -m unittest story_studio.voices.training_test
```

이 검사는 작은 합성 행렬을 사용하며 실제 음성 품질 평가를 대신하지 않습니다. 가중치를 내려받지 않고, 개인 녹음·생성 파일·학습 결과는 Git에 넣지 않습니다.
