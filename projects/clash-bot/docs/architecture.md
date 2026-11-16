# 실행과 학습의 책임

Counterpush 기능은 함께 바뀌는 책임별로 묶는다. 공개 CLI와 `.data` 저장 경로는 유지하며, 일반 Android/ADB 경로와 모델·시뮬레이터를 무리하게 공통화하지 않는다.

```text
apps/agent/src/
  counterpush/
    cli.ts             공개 명령
    runtime/           브라우저, 경기 실행, 자원 수명
    domain/            FIFO, 엘릭서, 유닛·생성물·진화 상태
    perception/        CPU 인식, 손패, 스킬 버튼, 설치
    policy/            합법 후보, 공유 판단 입력
    learning/          경기 후 학습, 고정 평가, 채택, 목표
    references/        검증한 그림 참조
    testing/           실제 화면 회귀 자료
  qwen/                Qwen, LoRA, 고정 특징 캐시, 재학습
  arena/               네이티브 규칙, 탐색, 자가대국
  trophy/              Android 트로피 반복 실행, 별도 관찰 기록
```

브라우저와 시각 인식 프로세스, 16GB 안팎의 Qwen은 실행기 하나가 소유한다. 한 경기 동안 모델을 고정하고, 경기 종료 후 확인된 입력과 결과로 학습한다. 배포 모델과 개인 학습 후보, 고정 비교를 위한 모델 선택을 구분한다. `episode.ts`는 경기를 기록하고 `learning/episode-learning.ts`가 학습 영수증과 재시작을 처리한다.

학습 중단·재시작은 `evolution.json`, `candidate-learning.json`, `candidate-rehearsal.json`으로 이어간다. `.data/counterpush/control/training-goal.json`에는 이번 목표의 시작 누적 수를 저장하므로 프로세스를 다시 켜도 100판 집계를 처음부터 세지 않는다. 평가 결과와 입력 복구 경기는 집계에서 제외한다. 입력 확인이 반복해서 실패하면 해당 경기의 입력을 중단하고 결과를 기다린 뒤 새 경기로 복구한다. 3경기 연속 실패하면 중단한다.

CPU 자가대국 프로세스는 각자 네이티브 전장과 고정 정책을 갖는다. 파일·통계·학습·체크포인트 쓰기는 부모 실행기만 수행한다. macOS에서는 Metal을 사용한 부모를 복제하지 않고 `spawn`으로 최대 4개를 시작한다. 중지는 최대 현재 4경기 묶음과 학습 저장 후 적용된다.

새 판단 입력은 학습·실전이 같은 계약을 사용한다. 기존 controller 1·2는 보존하고 controller 3 후보만 짧은 공개 상태 입력을 사용한다. 출처가 같은 행위별로 코드를 묶었으며 별도의 범용 프레임워크나 전역 서비스 컨테이너는 추가하지 않았다.

Counterpush 실행기는 `qwen/shared-inference.ts`의 로컬 소켓 수명도 소유한다. 트로피 실행기는 별도 잠금과 경기 기록을 소유하고 경기마다 고정 후보를 요청한다. Python은 어댑터만 별도 보관하며 같은 본체에서 순차 추론한 뒤 반드시 원래 학습 어댑터로 복귀한다. 트로피 연결에는 학습·모델 선택·승격 명령을 노출하지 않는다. 모델 작업이 있거나 Counterpush가 학습·고정 평가에 들어가면 추가 요청을 대기열에 넣지 않는다. 트로피 관찰의 `read_only_external` 표시는 실전 학습 로더에서도 거부한다.
