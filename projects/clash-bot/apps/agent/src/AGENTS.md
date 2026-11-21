# TypeScript 실행기 모듈 경계

의존은 `shared` ← `core` ← (`arena`, `trophy`) ← `loop` 한 방향이다. `arena`와 `trophy`는 서로 가져오지 않고, 어떤 계층도 `loop`를 가져오지 않는다. `core` 안은 기반 모듈 ← `battle` ← `placement` ← `policy` ← `fast` 순서다. 프로젝트의 `eslint.config.ts`가 폴더별로 아래 계층의 import를 막는다. 규칙을 바꿀 때는 이유를 같은 파일에 남긴다.

`trophy/`는 `shared`·`core`만 사용하는 별도 실험 경로다. `session.ts`가 내 행동 수집 계획·CPU 학습·고정 평가·채택·중단 복구의 순서를, `session-state.ts`가 저장 상태의 형식을, `trial.ts`가 평가 사전 등록·원본 재검사·판정·게시를, `actor.ts`가 한 경기의 고정 모델과 실제 선택 확률을, `simulation.ts`가 감독이 넘긴 시뮬레이터 챔피언의 가져오기와 학습 중이던 PPO 후보의 보관·복원을 소유한다. 화면 캡처·ADB·개인 참조 연결은 Git 밖 로컬 어댑터가 소유하고 학습기는 UI를 조작하지 않는다. CLI는 상태 조회와 JSON 통신을 제공한다.

- `core/`는 실행 환경에 의존하지 않는 게임 규칙이다. 카드·덱·화면 좌표와 프로필, `battle/`(카드 순환·엘릭서·필드 추적·진화와 능력 상태·인식 결과의 형식), `placement/`(배치 금지 구역·예측 배치·전투 예측), `policy/`(합법 후보, 판단 계약 decision-v3 직렬화, 타워 수비 보정), `fast/`(빠른 정책의 특징·추론·칸 단위 후보, Python `clash_bot.arena.policy`와 같은 계약)를 소유한다. decision-v3 문자열은 Python `clash_bot.qwen.action_prior`가 읽으므로 형식을 바꾸면 양쪽 검사를 함께 갱신한다. 전략적 선호로 사용 가능한 손패를 지우지 않는다. Python 시뮬레이션과 입력 형식을 바꾸면 공유 계약 검사도 갱신한다.
- `arena/`는 자가대국 Python 프로세스의 실행·백그라운드 시작과 상태·챔피언 정책 읽기(`process.ts`)를 소유한다. 자가대국 계산은 앱의 `python/clash_bot/arena/`가 소유한다.
- `loop/`는 자가개선 감독이다. 자가대국 유지와 재시작 한도(`plan.ts`·`supervisor.ts`), 챔피언 사본과 트로피 인계 파일(`handoff.ts`), 사건·상태(`state.ts`), 정기 보고(`report.ts`)를 소유한다. 자신이 시작하지 않은 자가대국을 멈추지 않고 실전 경기를 시작하지 않는다.
- 트로피의 CPU PPO와 정책 가져오기는 `python/clash_bot/trophy/`, CPU 인식은 `python/clash_bot/perception/`이 소유한다. 캐시에는 고정 특징만 저장하고 현재 정책 확률은 매번 다시 계산한다.
- 테스트는 구현 옆에 둔다. 여러 검사가 함께 쓰는 가짜 객체·하네스는 `*.fixture.ts`로 두며 Vitest 수집과 실행 동작 해시(트로피 실험 지문, `shared/behavior-source.ts`)에서 빠진다. 앱의 `assets/counterpush/`와 `test-fixtures/counterpush/`는 시각 자료를 소유하며 모델 가중치나 계정 정보는 넣지 않는다.
- 배포 포인터는 원본 증거를 재검사한 채택 경로에서만 바꾼다. 학습 횟수·손실 개선·빠른 응답을 실전 실력 향상으로 보고하지 않는다.
