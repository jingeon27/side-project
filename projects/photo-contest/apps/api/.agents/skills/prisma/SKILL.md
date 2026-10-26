---
name: prisma
description: API의 prisma/schema.prisma에 모델·컬럼·인덱스·제약을 더하거나 바꾸고 마이그레이션 SQL을 만들 때, 또는 쓰기 코드에서 Database.atomic()(Serializable 재시도)을 쓸지 정할 때 사용한다.
---

## 스키마 편집 (`prisma/schema.prisma`)

- 지금의 압축 형식을 지킨다: 블록 사이 빈 줄 없음, `이름 타입 속성`을 공백 하나로(열 정렬 없음), `@@id`·`@@unique`·`@@index`는 모델 끝. `prisma format`(에디터의 저장 시 포맷 포함)을 돌리지 않는다 — 파일 전체가 다시 정렬된다.
- 역할·상태 값은 Prisma enum 대신 `String` + TS `as const`로 둔다(`GroupMember.role` ↔ `src/group/group-role.ts`, 모르는 값은 권한이 적은 쪽으로 읽는다).
- "한 사람당 하나"는 DB 제약으로 건다(`Vote`의 `@@unique([contestId, voterId])`, `Like`의 `@@id([submissionId, userId])`). 토큰으로 찾는 열은 원문 대신 `sha256Hex` 값을 저장한다(`Session.tokenHash`, `Upload.tokenHash`, `AppLoginTicket.codeHash`).
- 부모와 함께 지워져야 하는 관계는 `onDelete: Cascade`를 명시한다 — 사진 삭제가 투표·좋아요·신고를 지우는 것이 여기에 기댄다.
- 개수(좋아요·표·신고)는 읽을 때 `_count`로 센다. 카운터 열을 더해 `increment`·`decrement`로 관리하지 않는다(사용자 결정).
- 생성 client는 `generated/prisma`(gitignore, 손대지 않는다). 모듈 파일은 `../../generated/prisma`에서 `Prisma`·모델 타입을 import한다.

## 파괴적 변경 금지

- 컬럼·테이블 삭제, 이름 변경(Prisma는 DROP + ADD를 만들어 데이터가 사라진다), 타입 축소, 기존 테이블에 기본값 없는 필수 컬럼(기존 행 때문에 실패)을 만들지 않는다.
- 이름은 `@map("옛이름")`·`@@map`으로 코드에서만 바꾸고, 안 쓰게 된 컬럼은 남긴다(`AnalyticsEvent.deliveredAt`). 새 컬럼은 `?`이거나 `@default(…)`. 기존 데이터에 unique를 새로 걸면 중복 행 때문에 실패할 수 있다.

## 마이그레이션 SQL 만들기 (DB에 접속하지 않는다)

side 루트에서 실행한다. `exec`는 apps/api에서 돌므로 prisma 인자는 앱 기준, `mkdir`·`>`는 side 루트 기준이다.

```sh
git show HEAD:projects/photo-contest/apps/api/prisma/schema.prisma > <스크래치 폴더>/schema.before.prisma
M=projects/photo-contest/apps/api/prisma/migrations/$(date -u +%Y%m%d%H%M%S)_<snake_case_이름>
mkdir -p "$M"
yarn workspace @photo-contest/api exec prisma migrate diff \
  --from-schema <스크래치 폴더>/schema.before.prisma \
  --to-schema prisma/schema.prisma --script > "$M/migration.sql"
yarn workspace @photo-contest/api db:generate
```

- `--from`은 마지막 마이그레이션까지 반영된 스키마다(보통 HEAD). 출력이 `-- This is an empty migration.`이면 폴더를 지운다.
- 폴더는 현재 마지막 마이그레이션 폴더보다 뒤에 정렬돼야 한다. 커밋된 `migration.sql`은 고치지 않고 새 폴더를 더한다 — 아직 어느 DB에도 적용하지 않았다고 사용자가 확인한 마이그레이션만 예외다. `migration_lock.toml`은 그대로 둔다.
- 만든 SQL에서 `DROP`, DEFAULT 없는 `NOT NULL`, `ALTER COLUMN … TYPE`, 새 `UNIQUE INDEX`를 찾아 의도한 것인지 확인한다.
- 실행하지 않는다: `prisma migrate dev`·`migrate reset`·`db push`·`db:migrate`(개발 DB의 public 스키마를 바꾼다). 개발 DB 적용은 사용자에게 `yarn workspace @side/photo-contest db:migrate`를 요청한다. `db:generate`는 사용자의 개발 서버가 쓰는 client도 바꿔 서버가 새 client로 다시 뜨고, 사용자가 적용하기 전까지 새 열을 쓰는 요청은 실패하므로 함께 알린다.

## 검증

- `yarn workspace @photo-contest/api test:integration`: globalSetup이 테스트 DB에 새 `api_test_*` 스키마를 만들고 모든 마이그레이션을 `prisma migrate deploy`로 적용한다. client는 schema.prisma 기준이라 SQL이 빠뜨린 열·제약은 그것을 쓰는 테스트에서만 드러난다 — 새 열·제약을 쓰는 api 테스트를 같이 더한다. 이어서 `typecheck`.

## `Database.atomic()` (`src/database/database.service.ts`)

- Serializable 트랜잭션이다. 직렬화 실패(P2034 또는 pg 어댑터의 TransactionWriteConflict)면 콜백 전체를 `SERIALIZABLE_ATTEMPTS`(4)번까지 다시 실행하고, 끝내 겹치면 CONFLICT `ERROR_MESSAGE.REQUEST_CONFLICT`. unique 위반(P2002)은 재시도 없이 CONFLICT `ERROR_MESSAGE.ALREADY_DONE`('이미 제출하거나 투표했습니다.'). 그 밖의 오류는 그대로 던진다.
- 쓰는 곳: 확인(단계·권한·소유)과 쓰기가 한 스냅샷이어야 할 때(`VoteService.castVote`, `SubmissionService.create`), 여러 행을 함께 바꾸며 이벤트를 남길 때(`GroupService.createGroup`). 콜백 안에서는 `tx`만 쓴다 — 권한 확인도 `{ client: tx }`로 넘기고, `this.db`는 트랜잭션 밖이다.
- 콜백은 다시 실행되므로 저장소 HEAD·삭제(`MediaStorage`)·fetch를 넣지 않는다. 업로드 완료는 트랜잭션 밖에서 HEAD로 확인한 뒤 확정하고(`MediaUploadService.completeUpload`), 삭제는 커밋 뒤에 한다(`ModerationService.remove`).
- 쓰지 않는 곳: 두 번 보내도 성공해야 하는 생성은 `createMany({ data: [row], skipDuplicates: true })`, 동시 요청이 모두 성공해야 하면 Serializable 없이 `this.db.$transaction`(`LikeService.like`). atomic 안의 P2002는 모두 ALREADY_DONE 문장이 되므로 다른 unique 충돌은 미리 확인하거나 skipDuplicates로 피한다.
- 확인 직후 지워진 행의 FK 위반(P2003)은 필요한 곳에서 NOT_FOUND로 바꾼다(`LikeService.like`).

Service는 Database.atomic 또는 UnitOfWork.atomic을 호출하고 권한 검사와 Prisma 조회·쓰기·이벤트에 같은 tx를 사용한다. 새 PostContestVote는 (contestId,voterId) unique와 Post(id,contestId)의 복합 FK를 유지한다. Contest.format default LEGACY와 nullable Post.contestId로 기존 데이터를 보존한다.
