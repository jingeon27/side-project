---
name: game-feedback-api-prisma
description: Game Feedback API의 prisma/schema.prisma에 모델·컬럼·인덱스·제약을 더하거나 바꾸고 migration SQL을 만들 때, 로컬 db:sync와 운영 migrate deploy(scripts/migrate.mjs) 경로를 판단할 때, 또는 서비스 쓰기 코드에서 UnitOfWork.run 트랜잭션·행 잠금을 쓸 때 사용한다.
---

DB·포트 격리와 금지 옵션은 프로젝트 `AGENTS.md`, 커밋 범위는 `game-feedback-commit` 스킬, 테스트 하네스는 `game-feedback-api-test` 스킬을 따른다. 경로는 apps/api 기준이다.

## 스키마 편집 (`prisma/schema.prisma`)

- client는 `src/generated/prisma`로 생성되고 gitignore다(손대지 않는다). 서비스는 `../generated/prisma`에서 `PrismaClient`·`Prisma`·모델 타입을 import하고, `scripts/build.mjs`가 이 폴더를 `dist/generated/prisma`로 복사한다.
- 파일은 `prisma format` 정렬 상태가 아니다(열 정렬 없음, `@relation(fields:[…])`처럼 공백 없는 줄이 섞여 있다). 포맷터를 돌리면 전체가 바뀌므로 바꾼 줄만 주변 형식대로 쓴다.
- 역할·상태·게시판·신고 대상은 Prisma enum이 아니라 `String`이다(`User.role`, `Post.board`, `Report.status`·`targetType`, `SupportConversation.topic`·`status`). 허용 값은 계약 Zod가 HTTP 경계에서 정한다. `ACTIVE_POST`(`src/common/content.ts`)가 `board in BoardKindSchema.options`로 거르므로 계약에서 게시판을 빼면 기존 행은 남고 모든 공개 화면에서 사라진다.
- JSON 열(`Post.document`·`coaching`·`friendSale`·`battle`·`gameProfile`, `User.profileLinks`, `GameAccount.profile`)의 모양은 계약 Zod만 보장한다. 값을 비울 때는 `Prisma.DbNull`.
- 토큰·식별자로 찾는 열은 원문 대신 `hash()` 값을 둔다(`Session.tokenHash`, `OAuthAttempt.stateHash`, `AppLoginTicket.codeHash`, `PostView.visitorHash`).
- `@updatedAt` 모델에서 카운터만 올릴 때는 `updatedAt`에 기존 값을 다시 넣는다(`PostViewsService.record`).
- 서비스 raw SQL이 테이블·열 이름을 그대로 쓴다(`"Post"`, `"User"`, `"ChatConversation"`, `"UserFollow"`, `"PostView"`). 모델·열 이름을 바꾸면 `$queryRaw`·`$executeRaw`를 함께 찾는다.

## schema.prisma로 표현하지 못하는 제약

- CHECK 제약은 migration SQL에만 있다: `PostMedia_published_upload_ready`, `ChatAttachment_sent_upload_ready`(미완료 업로드를 글·메시지에 연결 금지), `UserAvatar_storage_check`(`bytes`·`objectId` 중 하나), `UserAvatar_size_check`.
- 게시글 검색의 pg_trgm GIN 인덱스(`Post_title_trgm_idx`·`Post_body_trgm_idx`)도 migration SQL에만 있다. 확장은 DB 단위라 `public`에 두고 연산자 클래스를 `public.gin_trgm_ops`로 지정한다(DB 소유 역할이 만들 수 있는 trusted extension).
- `db push`로 만든 스키마(로컬 `db:sync`, 옛 `*.integration.test.ts` 하네스)에는 이 제약이 없다. 제약에 기대는 테스트는 `migrate deploy`로 스키마를 만드는 `*.integration.spec.ts` 형식으로 쓴다.

## migration 만들기 (DB에 접속하지 않는다)

폴더는 `prisma/migrations/<YYYYMMDDHHMMSS>_<snake_case>/migration.sql`이고 마지막 폴더보다 뒤에 정렬돼야 한다. `migration_lock.toml`은 그대로 둔다. side 루트에서:

```sh
git show HEAD:projects/game-feedback/apps/api/prisma/schema.prisma > <스크래치>/schema.before.prisma
M=projects/game-feedback/apps/api/prisma/migrations/$(date -u +%Y%m%d%H%M%S)_<이름>
mkdir -p "$M"
corepack yarn workspace @game-feedback/api exec prisma migrate diff \
  --from-schema <스크래치>/schema.before.prisma \
  --to-schema prisma/schema.prisma --script > "$M/migration.sql"
corepack yarn workspace @game-feedback/api db:generate
```

- `exec`는 apps/api에서 돌므로 prisma 인자는 앱 기준, `mkdir`·`>`는 side 루트 기준이다. `--from`은 마지막 migration까지 반영된 스키마(보통 HEAD)다. 빈 결과면 폴더를 지운다. CHECK 같은 수동 제약은 기존 migration처럼 SQL에 직접 더한다.
- 커밋된 `migration.sql`은 고치지 않고 새 폴더를 더한다.
- side 루트 `scripts/check-migrations.mjs`(CI 첫 단계)가 base 대비 **새로 추가된** migration에서 삭제·이름 변경·타입/NOT NULL 변경, 기본값 없는 `ADD COLUMN NOT NULL`, `TRUNCATE`, WHERE 없는 `DELETE`·`UPDATE`, CONCURRENTLY 없는 `CREATE INDEX`, `CREATE UNIQUE INDEX`, NOT VALID 없는 FK·CHECK 추가 등을 거부하고 기존 migration.sql 수정·삭제도 거부한다(전체 목록은 side 루트 `deploy/shared-instance/README.md`의 확장 → 배포 → 정리). 같은 migration에서 만든 테이블의 인덱스·제약은 통과한다. `prisma migrate diff`가 넣은 `/* Warnings: */` 주석은 검토 후 지운다. 기본은 expand → 배포 → contract로 나눈다. 의도한 경우만 그 문장 바로 윗줄에 `-- migration-lint: allow <규칙> — <5자 이상 이유>`를 단다(바로 다음 문장 하나에만 적용).
- 새 열은 `?`이거나 기본값을 둔다(`profileLinks`의 `NOT NULL DEFAULT '[]'`처럼). 기존 데이터에 새 unique를 걸면 중복 행 때문에 실패할 수 있다.

## 적용 경로 — 에이전트는 실행하지 않는다

- 로컬 개발 DB: `corepack yarn workspace @side/game-feedback db:sync` → `../../scripts/db.mjs sync`가 `guardDatabaseUrl`로 loopback 55442·`game_feedback`·`public`을 확인한 뒤 API `prisma:sync`(`prisma db push`)를 부른다. 프로젝트 `dev`·`setup`도 시작할 때 이것을 실행한다. 사용자에게 요청하고, CHECK 제약은 여기서 생기지 않는다고 함께 알린다.
- API `prisma:sync`를 직접 부르지 않는다 — URL 가드가 없다. `prisma migrate dev`·`migrate reset`·`--accept-data-loss`·`--force-reset`도 쓰지 않는다.
- 운영: `scripts/migrate.mjs`(빌드된 `dist`와 `NODE_ENV=production` 필요)가 `validateProductionEnvironment` → `prisma migrate deploy` → `seed(db, false)`(카테고리) → shared-instance면 권한 GRANT/REVOKE 순서로 돈다. `../../deploy/shared-instance/compose.yaml`의 `migrate` 서비스와 `../../deploy/lightsail/ops.sh`가 부른다. 로컬에서 돌리지 않는다.
- `db:generate`(API `test` 스크립트와 `codegen`도 실행)는 사용자의 개발 서버가 쓰는 `src/generated/prisma`를 다시 쓴다. 개발 DB에 적용되기 전까지 새 열을 쓰는 요청은 실패한다고 알린다.

## UnitOfWork (`src/database/unit-of-work.ts`)

- `run(async (tx) => …)`은 Prisma interactive `$transaction`이다(재시도·Serializable 없음). `run([q1, q2])`는 `this.db`로 만든 lazy PrismaPromise 배열을 한 번에 커밋·롤백한다. Repository 계층은 없다 — 서비스가 `PrismaClient`와 `UnitOfWork`를 직접 주입한다.
- 콜백 안에서는 `tx`만 쓴다(기존 코드는 `(tx ?? this.db)` 형태). 같은 연결이 필요한 helper에는 client를 넘긴다: `UserVisibilityService.excluded(req, tx)`, `ChatAccessService.visible(userId, id, tx)`·`blocked(…, tx)`, `PostMediaService.sync(tx, …)`. 콜백에서 `this.db`를 쓰면 다른 연결을 기다려 `connection_limit=1`에서 막힌다 — 이를 검사하는 테스트가 있다.
- 동시성은 잠금으로 직렬화한다. 기존 행은 `` tx.$queryRaw`SELECT "id" FROM "<Table>" WHERE "id" = ${id} FOR UPDATE` ``(글 수정·조회수, 채팅 전송·읽음·기록 삭제, 밴, 업로드 등록의 사용자 행), 아직 없는 키는 `pg_advisory_xact_lock(hashtextextended(key, 0))`(`SocialIdentityService.onboard`).
- 파일 저장·S3·SSE publish는 트랜잭션 밖이다: 저장 먼저 → `register` 트랜잭션(`PostMediaService.upload`), publish는 `run`이 끝난 뒤 `void this.events.publish(…)`.
- 트랜잭션 안의 P2002는 전역 필터가 409 `CONFLICT`로 바꾼다. 다른 코드가 필요하면 `.catch`로 바꾼다(`ChatMessageService.send`).

## 검증

- `test:integration`에서 `db push` 하네스 파일은 schema.prisma만 쓰고, `migrate deploy` 하네스 파일(`src/database/unit-of-work.integration.spec.ts`, `src/users/profile.service.integration.spec.ts`, `src/media-storage/media-storage.service.integration.spec.ts`, `src/posts/post-media-upload.service.integration.spec.ts`, `src/chat/chat-attachment-upload.service.integration.spec.ts`)은 모든 migration을 새 `gf_test_` 스키마에 적용한다. migration이 빠뜨린 열·제약은 그것을 쓰는 migrate-deploy 테스트에서만 드러나므로 새 열·제약을 쓰는 spec을 같이 더한다.

```sh
corepack yarn workspace @game-feedback/api db:generate
corepack yarn workspace @game-feedback/api typecheck
corepack yarn workspace @game-feedback/api test:integration
MIGRATION_BASE_REF=origin/develop node scripts/check-migrations.mjs   # side 루트, git diff만 읽는다
```
