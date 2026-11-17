# TypeScript 실행기 모듈 경계

의존은 `shared` ← `core` ← (`qwen`, `arena`) ← `counterpush/{perception, browser, learning, match}` ← `counterpush/loop` 한 방향이다. 프로젝트의 `eslint.config.ts`가 폴더별로 아래 계층의 import를 막는다. 규칙을 바꿀 때는 이유를 같은 파일에 남긴다.

`trophy/`는 `shared`·`core`만 사용하는 별도 실험 경로다. `session.ts`가 내 행동 수집 계획·CPU 학습·고정 평가·채택·중단 복구의 순서를, `session-state.ts`가 저장 상태의 형식을, `trial.ts`가 평가 사전 등록·원본 재검사·판정·게시를, `actor.ts`가 한 경기의 고정 모델과 실제 선택 확률을 소유한다. 화면 캡처·ADB·개인 참조 연결은 로컬 어댑터가 소유하고 학습기는 UI를 조작하지 않는다. CLI는 상태 조회와 JSON 통신을 제공한다.

- `core/`는 실행 환경에 의존하지 않는 게임 규칙이다. 카드·덱·화면 좌표와 프로필, `battle/`(카드 순환·엘릭서·필드 추적·진화와 능력 상태·인식 결과와 상대 관찰의 형식), `placement/`(배치 금지 구역·예측 배치·전투 예측), `policy/`(합법 후보와 Qwen 판단 계약), `fast/`(빠른 정책의 특징·추론·칸 단위 후보, Python `clash_bot.arena.policy`와 같은 계약)를 소유한다. 전략적 선호로 사용 가능한 손패를 지우지 않는다. Python 시뮬레이션과 입력 형식을 바꾸면 공유 계약 검사도 갱신한다.
- `counterpush/cli.ts`는 공개 명령과 인자만 소유한다. `counterpush/profile.ts`는 저장소 프로필을 읽고 덱을 확인한다.
- `counterpush/browser/`는 전용 Chrome의 화면 캡처·입력·덱 확인·결과 판독만 소유한다.
- `counterpush/perception/`은 화면에서 읽은 사실과 신뢰도를 `core` 형식으로 반환한다. 자원 부족으로 회색인 카드와 사용 가능한 카드를 구분하고, 읽지 못한 값을 정답으로 채우지 않는다.
- `counterpush/match/`는 경기 한 판의 캡처·판단·입력 확인·기록을 소유한다. 모델은 경기 중에 바뀌지 않으며 학습·평가 순서를 알지 못한다.
- `counterpush/learning/`은 저장된 경기 기록으로 상대 모방 자료·재인식·감사 집계를 만든다. 브라우저를 열지 않는다.
- `counterpush/loop/`는 후보 학습 → 고정 평가 → 채택과 100판 목표를 순서대로 실행한다. 평가 경기와 입력 복구 경기는 학습 자료나 학습 목표 수에 넣지 않는다.
- 테스트는 구현 옆에 둔다. 여러 검사가 함께 쓰는 가짜 객체·하네스는 `*.fixture.ts`로 두며 Vitest 수집과 실행 동작 해시(`behavior-identity.ts`)에서 빠진다. `counterpush/match/`의 `episode.spec.ts`·`episode-inputs.spec.ts`·`episode-fast-policy.spec.ts`는 `episode.fixture.ts`의 가짜 브라우저·인식·모델로 한 판의 기록을 고정하므로 경기 루프를 바꾸면 먼저 이 검사들을 확인한다. 앱의 `assets/counterpush/`와 `test-fixtures/counterpush/`는 시각 자료를 소유하며 모델 가중치나 계정 정보는 넣지 않는다.
- 손패 참조는 `assets/counterpush/hand-templates/manifest.json`이 카드·상태·SHA-256을 소유하고 실행기는 그 폴더를 직접 읽는다. `.data`로 복사하지 않는다. 그림을 바꾸면 manifest와 `counterpush/perception/hand-references.*` 검사를 함께 갱신하고, 라벨은 그림을 직접 확인해 정한다.
- `qwen/`은 모델 클라이언트, `arena/`는 자가대국 실행 연결을 소유한다. Python 계산·캐시·기울기 갱신은 앱의 `python/clash_bot/qwen/`, 네이티브 환경은 `python/clash_bot/arena/`, CPU 인식은 `python/clash_bot/perception/`이 소유한다. 캐시에는 고정 특징만 저장하고 현재 정책 확률은 매번 다시 계산한다.
- 배포 포인터는 원본 증거를 재검사한 채택 경로에서만 바꾼다. 학습 횟수·손실 개선·빠른 응답을 실전 실력 향상으로 보고하지 않는다.
