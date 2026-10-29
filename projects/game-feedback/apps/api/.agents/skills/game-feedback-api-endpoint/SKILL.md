---
name: game-feedback-api-endpoint
description: Game Feedback API(apps/api)에 REST 엔드포인트를 추가·변경하거나 요청·응답 계약을 바꿀 때(contracts Zod 스키마와 operations 등록, DTO·ValidatedBody, controller·service·presenter·module 배치, Guard 권한, ApiError 오류, admin/* controller, OpenAPI → Orval SDK 재생성과 diff 확인까지) 사용한다.
---

검증 절차는 프로젝트 `game-feedback-test`, 커밋은 `game-feedback-commit` 스킬을 따른다. 인증 경로는 `game-feedback-api-auth`, DB 변경은 `game-feedback-api-prisma`, 테스트 작성은 `game-feedback-api-test`, 첨부·채팅·SSE는 `game-feedback-api-media-chat` 스킬을 본다. 경로는 apps/api 기준이다.

## 순서

1. **계약** `../../packages/contracts/src/index.ts`: 입력은 `.strict()` Zod 객체로 쓴다(trim·정규화·한국어 오류 문장이 여기 있다). 응답의 시각은 `ResponseTimestampSchema`(ISO 문자열), ID는 `ResponseIdSchema`. 이름 있는 모델이 필요하면 `schemas`에 더하고 `operations`에 `{ method, path: '/api/x/{id}', id, body?, response, query?, contentType? }`를 더한다. `id`가 SDK 함수 이름이 된다.
2. **OpenAPI 한계** (`src/openapi.ts`): 성공 응답은 항상 `'200'`만 기록한다. `query: true`는 `cursor`·`limit`만 만들고, 그 밖의 쿼리는 `listPosts`·`listReports`(status) 분기처럼 이 파일에 직접 적는다. SSE(`/api/chat/events`)와 바이너리 GET(`/api/post-media/:id`, `/api/users/:id/avatar`, 채팅 첨부 GET)은 `operations`에 넣지 않는다.
3. **계약 빌드**: API는 `@game-feedback/contracts`의 `dist`를 import한다. 계약을 고친 뒤 `codegen`(또는 contracts `build`) 전에는 API `typecheck`가 옛 타입을 본다. API `test` 스크립트는 빌드를 먼저 한다.
4. **DTO** `src/<domain>/<name>-input.dto.ts`: contracts의 입력 스키마를 공개하고 `T<Name>Dto = z.output<typeof XInputSchema>`로 타입을 추론한다. Controller는 `@ValidatedBody(XInputSchema)`·`@ValidatedQuery(XQuerySchema)`로 Nest 12 schema 메타데이터를 지정한다. 전역 `RequestValidationPipe`는 내장 `StandardSchemaValidationPipe`를 통해 Zod를 한 번 실행하고 정규화된 plain object를 전달한다. strict body와 query의 알 수 없는 키 처리는 각 스키마가 소유한다. 원본 JSON의 금지된 키도 스키마가 거부하며 실패는 400 `VALIDATION_ERROR`다.
5. **Controller** `src/<domain>/<domain>.controller.ts`: `@Controller('api')` 또는 `'api/<prefix>'`. 본문 `@ValidatedBody(XInputSchema)`, 쿼리 `@ValidatedQuery(XQuerySchema)`(목록은 `ListQuerySchema`), enum 경로 값 `@Param('x', new ContractValuePipe(Schema))`. `@Req() req: SessionRequest`를 서비스로 넘기고 규칙은 서비스에 둔다. `PATCH /api/profile`도 UserGuard와 UpdateProfileInputSchema를 거쳐 검증한 입력만 Service로 전달한다.
6. **POST는 `@HttpCode(200)`**: 계약이 200만 선언하므로 기존 POST가 모두 붙인다. 쿠키를 쓰면서 JSON을 돌려주면 `@Res({ passthrough: true })`.
7. **주입은 항상 `@Inject(Token)`**: `dev`(tsx)와 Vitest가 `design:paramtypes`를 만들지 않아 타입만으로는 주입되지 않는다(`request-validation.ts` 주석). 서비스는 `@Inject(PrismaClient)`, `@Inject(UnitOfWork)`, `@Inject(APP_CONFIG)`를 쓴다. Repository 계층은 없다.
8. **Module**: 도메인 module의 `controllers`·`providers`에 등록하고 새 module은 `src/app.module.ts` `imports`에 더한다. 다른 도메인 서비스는 그 module의 `exports`로 받는다(`PostsModule` → `UsersModule`의 `UserVisibilityService`). `DatabaseModule`(PrismaClient·UnitOfWork·APP_CONFIG)과 `MediaStorageModule`은 `@Global`이다.

## 권한·가시성

- `@UseGuards(UserGuard | AdminGuard)`(`src/common/http/session.guard.ts`)를 붙여도 서비스 첫 줄에서 `requireUser(req)`·`requireAdmin(req)`(`src/auth/session/session-access.ts`)로 사용자를 받는다. Guard가 파이프보다 먼저라 비로그인은 400보다 401이 먼저 나온다.
- 소유 확인은 서비스에서 한다(`authorId !== u.id` → 403 `FORBIDDEN`). 볼 수 없는 대상은 404로 존재를 숨긴다.
- 공개 목록·상세는 `ACTIVE_CONTENT`/`ACTIVE_POST`(`src/common/content.ts`)와 `authorId: { notIn: await this.visibility.excluded(req) }`(양방향 차단 + 일반 모드의 테스트 계정)를 함께 건다. 답변·댓글 개수 같은 하위 집계에도 같은 조건을 쓴다.
- 커서 목록: `decodeCursor`/`encodeCursor`(`src/common/pagination.ts`), `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]`, `take: limit + 1`, 응답 `{ items, nextCursor }`.

## 응답

- presenter `src/<domain>/<name>.presenter.ts`에 Prisma `include` 상수와 `responseX(row)`를 둔다. 날짜는 `.toISOString()`. 사용자는 `authorSelect` + `authorDto`/`userDto`(`src/users/user.presenter.ts`)로만 내보낸다 — `demoKey`·`googleSubject`를 싣지 않고, 밴 정보는 `userDto`(본인 세션·관리자 응답)에만 있다.
- 서버는 응답을 Zod로 검증하지 않는다(`attachmentDto`만 `ChatAttachmentSchema.parse`). SDK transport가 검증하며 선언되지 않은 키는 버린다 — 계약에 없는 필드는 클라이언트에 닿지 않고, 필수 모양이 어긋나면 Web에서 `INVALID_API_RESPONSE`가 된다. 통합 테스트에서 `XSchema.parse(res.body)`로 확인한다.

## 오류

- `throw new ApiError(status, 'UPPER_SNAKE', '한국어 문장')`(`src/common/http/api-error.ts`) → `{ errorCode, message }`. SDK는 `^[A-Z][A-Z0-9_]{0,99}$`가 아닌 코드를 `REQUEST_FAILED`로 바꾼다. Nest 내장 예외(`NotFoundException` 등)는 `ApiExceptionFilter`가 일반 문장으로 덮으므로 쓰지 않는다.
- 필터는 Prisma P2002 → 409 `CONFLICT`, P2025 → 404 `NOT_FOUND`, 나머지 → 500 `INTERNAL_ERROR` + Sentry로 바꾼다. 의미 있는 코드가 필요하면 서비스에서 잡는다(`ChatMessageService.send`의 P2002 → `MESSAGE_CONFLICT`).

## admin/*

- `src/admin/<area>/admin-<area>.controller.ts`·`admin-<area>.service.ts`·`<area>-input.dto.ts`를 `src/admin/admin.module.ts`에 등록한다. 클래스에 `@UseGuards(AdminGuard)` + `@Controller('api/admin…')`(`'api/admin/users'`, `'api/admin'` + `reports`·`hide`), 서비스도 `requireAdmin(req)`.
- 공개 서비스를 주입해 재사용하지 않는다(공개 `CategoriesService`와 `AdminCategoriesService`가 같은 테이블을 따로 다룬다). `AdminModule`은 `ChatModule`만 import한다.
- 관리자 변경은 같은 `transactions.run` 안에서 `auditLog.create({ actorId, action, targetType, targetId, detail })`를 남긴다. 감사 기록이 실패하면 변경도 롤백된다(`src/database/unit-of-work.integration.spec.ts`).

## 경로를 하드코딩한 곳

새 경로를 만들거나 이름을 바꾸면 함께 본다.
- `src/common/http/banned-access.ts`: 밴 사용자에게 허용하는 쓰기 경로.
- `src/rate-limit.ts`: 인증 시도(`authAttempts`)·업로드·업로드 완료·게임 프로필 조회 버킷, health 경로.
- `src/chat/chat-lifecycle.middleware.ts`: 세션을 바꾸는 POST, `DELETE /api/me`, 차단 경로의 SSE 종료·알림.
- `../../packages/sdk/src/index.ts`: 생성 함수 re-export 목록(손으로 관리한다). 빠지면 Web·Admin이 `@game-feedback/sdk`에서 import하지 못한다.

## 설정값

- 실행 설정은 `src/config/app.config.ts`의 `AppOptions`/`resolveAppConfig`에 둔다(테스트가 옵션으로 덮는다). 운영 필수 값은 `src/config/production.config.ts`의 `validateProductionEnvironment`, 키는 프로젝트 `.env.example`에 더한다. 외부 자격 증명이면 `scripts/test.ts` env에서 비운다.

## 체크리스트

- [ ] 계약 operation·스키마, Zod 스키마·추론 DTO 타입, POST `@HttpCode(200)`, `@Inject` 명시
- [ ] Guard + 서비스 `requireUser`/`requireAdmin`, 가시성 필터, 관리자 AuditLog
- [ ] 하드코딩 경로 목록과 SDK `index.ts` export
- [ ] DTO 경계는 `src/common/http/request-validation.spec.ts`, 동작은 대상 옆 `*.integration.spec.ts`(Origin 403, 401, 403, 404, 400 코드 포함)
- [ ] `codegen` 후 재생성된 SDK를 함께 커밋, SDK test, 프로젝트 `check`

## 명령 (side 루트)

```sh
yarn workspace @side/game-feedback codegen        # contracts build → db:generate → openapi → Orval
git diff --stat -- projects/game-feedback/packages/sdk/src/generated   # CI는 재생성 뒤 diff가 있으면 실패한다
yarn workspace @game-feedback/sdk test            # 모든 operation이 응답 스키마를 넘기는지
yarn workspace @game-feedback/api typecheck       # 테스트 포함 tsconfig.json + 빌드 전용 tsconfig.build.json
yarn workspace @game-feedback/api test:integration
yarn workspace @side/game-feedback check          # 전체 typecheck + API·패키지 lint(프로젝트 루트) + web·mobile·admin lint
```
