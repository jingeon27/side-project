---
name: game-feedback-test
description: Run scoped Game Feedback verification with isolated fake providers and PostgreSQL targets.
---

# Game Feedback 테스트

1. 현재 Worktree와 `git status --short`를 확인하고 Node.js 24를 선택한다.
2. 변경 범위에 맞게 루트에서 `yarn workspace @side/game-feedback check`, `test`, `test:e2e`, `build`를 실행한다. 단순 문서 변경에는 전체 테스트가 필요하지 않다.
3. 계약 변경은 `codegen`을 실행한 뒤 OpenAPI/Orval 생성 diff를 검토한다. 생성 파일을 직접 수정하지 않는다.
4. 테스트 DB는 loopback 55444의 `game_feedback_test`와 자체 `gf_test_` 스키마만 사용한다. 외부 OAuth·Supercell 구현을 호출하지 않는다.
5. reset/db push를 실행하지 않는다. 테스트 정리는 생성한 `gf_test_` 스키마만 삭제할 수 있다.
6. 실행한 명령·결과·미확인 외부 항목을 완료 보고에 남긴다. 실제 Google/Supercell, 사용자 모집, 배포는 별도 검증으로 기록한다.
7. 종료 후 필요하면 `db:test:stop`을 사용한다. 다른 프로세스나 다른 서비스의 DB를 종료하지 않는다.
