# Story Studio Python engine

한국어 원고·음성·이미지·영상 생성과 음성 QLoRA 학습을 담당하는 독립 Python 앱입니다. 웹 화면은 형제 `web` 앱이 담당합니다. Apple Silicon의 Python 3.11에서 실행하며 `pyproject.toml`이 Python 패키지와 고정 의존성의 기준입니다.

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
  generation/           한국어 글·음성 생성, FLUX.2 Klein 이미지와 Wan2.2 영상
  voices/
    samples.py          녹음 검증·정규화
    jobs.py             데이터 검증·학습 실행·완료 가중치 로드
    training.py         MLX QLoRA 계산·옵티마이저·체크포인트
    store.py            음성 실행·체크포인트 경로
  assets.py             개인 자산·공개 예시 경로
  storage.py            원자적 비공개 JSON 저장
  media.py              ffmpeg·자막·영상 합치기
  setup.py              모델 설치·Wan2.2 MLX 변환
  catalog.py            패키지에 포함된 모델 설정 읽기
  models.json           고정한 모델 저장소와 revision
```

생성 함수는 전달받은 입력과 진행 콜백을 사용합니다. 진행 상태와 취소는 작업별 `JobContext`가 소유하며 전역 사전으로 공유하지 않습니다. 테스트는 담당 구현 옆에 두고, 실제 모델이 필요한 계산은 해당 작업에서만 불러옵니다.

## 계약과 수명

표준 입력으로 JSON 요청 하나를 읽고 표준 출력에 줄 단위 JSON 진행 상태와 결과를 씁니다. 모델 진단은 표준 오류로 분리합니다. 모델 하나를 사용하는 프로세스가 `local/gpu.lock`을 소유하며 작업 후 프로세스 종료로 모델 메모리를 반환합니다. 영상 합치기·녹음 정규화처럼 모델을 쓰지 않는 작업은 GPU 잠금을 점유하지 않습니다.

데이터 저장 위치는 전달받은 `--data-dir`가 결정합니다. 자산은 `assets`, 영상 상태는 `tasks`, 녹음은 `voices`, 학습 상태와 체크포인트는 `voice-training/runs`에 남습니다. 폴더 이동이 아니라 코드 소유권을 분리하는 변경이므로 기존 실행과 완료된 가중치를 그대로 조회·재개합니다. 인증·HTTP·사용자 화면의 정책은 웹이 소유합니다.

## 목소리별 합성 보정과 대사 확인

완료된 학습 실행에만 `voice-training/runs/<runId>/synthesis.json`과 `synthesis-speaker.safetensors`를 추가해 보정을 켤 수 있습니다. 설정이 없는 목소리는 기존 합성 경로를 사용합니다. 보정 설정은 실행 ID·데이터 해시·모델 revision·체크포인트·실제 어댑터와 화자 파일의 SHA256에 묶이며, 파일이 바뀌거나 설정이 잘못되면 오류를 반환합니다.

보정은 학습 어댑터의 talker/code predictor 적용 강도와 화자 기준, 샘플링 온도·seed를 정합니다. 원래 체크포인트는 수정하지 않습니다. 음색의 유사도는 별도 원음 비교로 검증해야 하며 설정 파일만으로 품질을 보장하지 않습니다.

`version: 1`은 화자 특징만 사용하는 기존 보정입니다. 말투·억양을 함께 참고하려면 `version: 2`와 `referenceText`, `referenceSha256`을 사용하고 같은 실행 폴더에 `synthesis-reference.wav`를 둡니다. 기준 음성은 24kHz 모노 PCM16, 3~30초여야 하며 전체 프레임과 파일 해시를 확인합니다. 대본은 기준 음성과 일치해야 합니다. 기준 음성의 경로나 외부 URL은 설정으로 받지 않습니다.

두 번째 버전은 고정된 MLX Qwen3-TTS Base의 ICL 경로에서 기준 음성의 오디오 코드와 대본을 문맥으로 사용합니다. 화자 특징은 보정 프로필의 벡터를 유지해 원음을 바꿀 때 음색까지 다시 추정되지 않도록 합니다. 이 연결은 작업별 모델 객체에만 적용하며 기본 모델이나 다른 목소리의 설정을 변경하지 않습니다. 생성 결과에는 요청한 대사만 남고 아래의 대사 확인·재시도를 동일하게 적용합니다. 평가할 문장의 원음은 기준 음성에서 제외해, 말 속도·음높이·억양 비교와 음색 진단을 함께 기록합니다. 이는 추가 경사 학습과 구분합니다.

이 경로는 대사를 160자 이하의 구간으로 묶어 합성한 뒤 로컬 Qwen3-ASR로 전체 글자와 각 문장의 포함 여부를 확인합니다. 빠진 구간만 한 번 더 생성합니다. 두 번째 버전은 code predictor 강도를 최대 1.5까지 보정할 수 있으며, 1보다 강하게 적용한 경우 두 번의 합성으로도 확인되지 않은 구간만 강도 1로 추가 한 번 생성합니다. 원래 화자·말투 기준은 유지하고 정상 구간은 재사용합니다. 정해진 횟수 뒤에도 확인되지 않으면 불완전한 파일을 자산으로 저장하지 않고 오류를 반환합니다. 첫 번째 버전의 강도 상한과 합성 횟수는 각각 1과 2로 유지합니다. 음성인식의 오인식으로 정상 대사도 거절될 수 있으므로 발음 검사의 성공을 사람이 들은 검증으로 설명하지 않습니다. 음높이나 재생 속도를 후처리로 바꾸지 않습니다.

TTS를 해제한 다음 ASR을 불러오며, 재생성 때도 ASR을 먼저 해제합니다. 기존 worker의 GPU 잠금은 전체 과정 동안 유지합니다. 원고와 인식 결과는 외부로 보내지 않으며 내부 재시도에 별도의 클릭·서버 성공 Amplitude 이벤트를 추가하지 않습니다.

대사 확인 모델은 보정을 쓰는 환경에서만 별도로 설치합니다. 모델 revision과 디렉터리는 `models.json`의 `voice-asr`가 소유합니다. 기본 전체 설치와 다른 목소리의 합성에는 이 모델을 요구하지 않습니다.

```sh
PYTHONPATH=src ../web/.data/local/.venv/bin/python -m story_studio.setup \
  --data-dir ../web/.data --only voice-verification
```

## 검증

```sh
yarn workspace @story-studio/engine check
```

모델 없이 import·작업 상태 저장·음성 보정 파일 계약을 검사합니다. Apple Silicon MLX 추가 의존성이 없으면 네이티브 학습·합성 수명 검사만 명시적으로 건너뜁니다. 실제 학습·재개 결과 일치는 엔진 앱 폴더에서 전용 가상환경으로 실행합니다.

```sh
PYTHONPATH=src ../web/.data/local/.venv/bin/python -m unittest story_studio.voices.training_test
```

이 검사는 작은 합성 행렬을 사용하며 실제 음성 품질 평가를 대신하지 않습니다. 가중치를 내려받지 않고, 개인 녹음·생성 파일·학습 결과는 Git에 넣지 않습니다.
