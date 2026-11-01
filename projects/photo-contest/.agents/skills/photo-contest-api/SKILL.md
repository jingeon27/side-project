---
name: photo-contest-api
description: 피식 NestJS GraphQL·REST API의 도메인·인증·Prisma·권한·통합 테스트를 변경할 때 사용한다. REST 전용 Game Mate의 계약 생성 방식은 적용하지 않는다.
---

# 피식 API

프로젝트·앱 AGENTS.md와 루트 TypeScript 규칙을 따른다. 경로는 `apps/api` 기준이다. 변경 주제의 문서만 읽는다.

- 모듈·resolver·서비스·이벤트·설정·codegen: [엔드포인트](references/module.md).
- 그룹·게시물·대회·권한·오류·DI 경계: [도메인](references/domain.md).
- HttpOnly 쿠키·익명/아이디 로그인·Origin: [인증](references/auth.md).
- schema·migration·Serializable 재시도: [Prisma](references/prisma.md).
- 실제 PostgreSQL·Supertest·하네스: [API 테스트](references/api-test.md).
- 프로젝트 레인·포트·실제 S3 격리: [피식 테스트](../photo-contest-testing/SKILL.md).

개발/운영 DB와 다른 프로세스를 변경하지 않는다. destructive reset·자동 baseline·버킷 생성/삭제·S3 대역은 도입하지 않는다.
