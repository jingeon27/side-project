# Clash Bot

- 화면만 읽어 Counterpush 웹 게임을 두는 로컬 봇과, 고정 챔피언과 분리된 Qwen 후보 학습·검증 후 채택을 소유한다. 실제 클래시로얄 클라이언트(Android·에뮬레이터) 자동 조작은 Supercell 이용약관이 봇·자동화를 금지하므로 만들지 않는다. 실행 기록·모델·계정 프로필·Python 환경은 Git에서 제외된 `.data`가 소유한다.
- 폴더 소유권과 실행 흐름은 [docs/architecture.md](docs/architecture.md), 학습 판정과 한계는 [docs/learning-design.md](docs/learning-design.md)·[docs/arena-learning.md](docs/arena-learning.md)를 따른다. 모듈별 규칙은 `apps/agent/src/counterpush/AGENTS.md`와 `apps/agent/python/AGENTS.md`에 있다.
- 코드·계약·저장 형식은 [current-code-only](.agents/skills/current-code-only/SKILL.md)를 따른다. legacy 호환 없이 현재 코드와 현재 형식의 기록으로만 동작한다.
- 다른 실행의 `.data`와 프로세스를 바꾸지 않는다. 학습기(`qwen/selfplay/lock.json`)나 자가대국(`arena/control/lock.json`)이 실행 중이면 setup으로 venv·모델을 바꾸지 않으며, 워커 프로세스가 끝난 뒤에 잠금을 푼다.
- 적용 모델은 원본 증거를 재검사한 게시 경로로만 바뀐다. 채택 게이트 기준과 결과 라벨은 `apps/agent/contracts/qualification.json` 하나를 TS와 Python이 함께 읽는다.
- 손패 참조는 `apps/agent/assets/counterpush/hand-templates/manifest.json`이 카드·상태·SHA-256을 소유한다. 그림 라벨은 직접 확인해 정하고 검사를 함께 갱신한다.
- 일반 검사는 `yarn workspace @side/clash-bot check`(lint·타입·Vitest 단위 레인)와 `check:python`·`test:python`(모델 없는 계약)이다. CI는 모델을 내려받지 않는다. 실모델·통합 검사(`test:integration`, `test:learning:model`, `test:perception:model`, `test:arena:model`)는 명시적으로 실행하고, 보고할 때 실행한 검사와 건너뛴 검사를 구분한다.
