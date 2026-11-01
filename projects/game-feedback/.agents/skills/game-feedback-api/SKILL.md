---
name: game-feedback-api
description: Game Mate Nest REST API의 Zod/OpenAPI/SDK 계약·인증·Prisma·미디어·채팅·HTTP 통합 테스트를 변경할 때 사용한다.
---

# Game Mate API

프로젝트·앱 AGENTS.md와 루트 TypeScript 규칙을 따른다. 경로는 `apps/api` 기준이다. 필요한 주제만 읽는다.

- Zod → OpenAPI → Orval·DTO·권한·오류·SDK: [엔드포인트](references/endpoint.md).
- 세션·Origin·OAuth·데모/테스트 인증·밴: [인증](references/auth.md).
- schema·migration·UnitOfWork·잠금: [Prisma](references/prisma.md).
- 실제 S3·업로드 티켓·채팅 멱등성·읽음·SSE: [미디어와 채팅](references/media-chat.md).
- 격리 PostgreSQL·Supertest·하네스·정리: [통합 테스트](references/test.md).
- 프로젝트 명령과 검증 범위: [프로젝트 테스트](../game-feedback-testing/SKILL.md).

계약을 바꾸면 codegen을 실행하고 생성 결과를 포함한다. 개발/운영 DB reset·데이터 손실 강제 옵션·자동 baseline·버킷 생성/삭제·S3 대역은 도입하지 않는다.
