---
name: game-feedback-testing
description: Run scoped Game Feedback verification with isolated fake providers and PostgreSQL targets.
---

# Game Feedback 테스트

1. 현재 Worktree와 `git status --short`를 확인하고 Node.js 24를 선택한다.
2. 변경 범위에 맞게 루트에서 `yarn workspace @side/game-feedback check`, `test`, `test:e2e`, `build`를 실행한다. 단순 문서 변경에는 전체 테스트가 필요하지 않다.
3. 계약 변경은 `codegen`을 실행한 뒤 OpenAPI/Orval 생성 diff를 검토한다. 생성 파일을 직접 수정하지 않는다.
4. 테스트 DB는 loopback 55444의 `game_feedback_test`와 자체 `gf_test_` 스키마만 사용한다. 외부 OAuth·Supercell 구현을 호출하지 않는다.
5. 로컬 스키마는 URL 가드를 거친 db:sync로 적용하고 운영은 검토된 migration의 migrate deploy를 사용한다. reset과 데이터 손실 강제 옵션은 사용하지 않는다. 테스트 정리는 생성한 `gf_test_` 스키마와 이번 실행에서 새로 만든 `game-feedback-smoke-*` Docker project/volume만 삭제할 수 있다.
6. 실행한 명령·결과·미확인 외부 항목을 완료 보고에 남긴다. 실제 Google/Supercell, 사용자 모집, 배포는 별도 검증으로 기록한다.
7. 종료 후 필요하면 `db:test:stop`을 사용한다. 다른 프로세스나 다른 서비스의 DB를 종료하지 않는다.
8. 단위·통합 테스트는 주 대상 구현 파일과 같은 디렉터리에 둔다. API 통합 테스트에는 `*.integration.spec.ts` 또는 `*.integration.test.ts`를 사용해 Vitest 통합 레인에서 수집되도록 한다. 여러 도메인을 함께 검증하는 테스트도 주 대상 옆에 유지한다.
