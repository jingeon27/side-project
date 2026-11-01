# module

도메인 규칙과 오류 code→HTTP 표는 [contest-api](domain.md) 문서, 테스트는 [api-test](api-test.md), DB 변경은 [prisma](prisma.md), 인증 경로는 [auth](auth.md) 문서을 따른다.

## 순서

1. **계약** `src/<name>/<name>.graphql`: 다른 파일처럼 `type Query { … }`·`type Mutation { … }`로 쓴다. `typePaths`(`src/**/*.graphql`)가 자동으로 합치므로 따로 등록하지 않는다. 시각 필드는 `DateTime`이고 서비스는 `Date`를 돌려준다(문자열이면 `DateTimeScalar.serialize`가 내부 오류를 낸다).
2. **모듈** `src/<name>/<name>.module.ts`: `providers: [<Name>Service, <Name>Resolver]`, REST는 `controllers`. 권한 확인이 필요하면 `imports: [GroupModule]`. `Database`·`MediaStorage`·`SessionService`는 `@Global` 모듈이 주고 `recordEvent`는 함수라 import할 모듈이 없다. `src/app.module.ts`의 `imports`에 등록한다.
3. **리졸버**: `@Resolver('<Type>')` + `@Query()`·`@Mutation()`·`@ResolveField()`, 메서드 이름 = 필드 이름(겹치면 `@ResolveField('phase') currentPhase`). 로그인 필수는 `@Viewer() viewer: IViewer`, 공개는 `@OptionalViewer() viewer: IViewer | null`. 규칙·쿼리는 서비스로 넘긴다.
4. **응답 모양**: schema-first라 TS가 `.graphql`과 맞는지 검사하지 않는다. 서비스의 `I<Type>View`(필드 리졸버가 있으면 `I<Type>Node`) 인터페이스로 모양을 고정하고, 스키마의 모든 필드를 같은 이름 속성이나 `@ResolveField`로 채운다 — 빠진 non-null 필드는 INTERNAL_SERVER_ERROR로 가려진다. User는 `USER_VIEW_SELECT`로 고른다.
5. **다른 모듈의 타입에 필드**: 의존하는 쪽 모듈에 `@Resolver('<그 타입>')` 필드 리졸버를 둔다(`src/contest/group-contest/group-contests.resolver.ts`가 `Group.contests`). 모듈 순환 import를 만들지 않는다.
6. **서비스**: 검증할 입력은 `unknown`으로 받아(`ICreateContestInput`) `textValue(value, TEXT_LIMIT.X, '라벨')`·`pageRange(offset, limit)`·zod `safeParse` + `fail()`로 좁힌다. 기본값이 있는 인자에도 명시적 `null`이 올 수 있으니 `?? 기본값`. 권한은 `MembershipService`의 `requireMember`·`requireAdmin`·`requireOwner`·`accessibleContest(userId, id, { owner, client })`·`accessibleSubmission(…)`으로만 확인한다 — `groupMember`를 직접 조회해 판단하지 않는다.

## 오류

- `fail(message, ERROR_CODE.X)`(기본 BAD_USER_INPUT). 여러 모듈이 쓰는 문장은 `ERROR_MESSAGE`, 한 모듈 문장은 그 서비스의 `const MESSAGE = { … } as const`에 둔다.
- REST에서도 `fail()`을 던진다. 전역 예외 필터가 `httpStatusOf(code)` 상태와 `{ message }` 본문을 만든다. Nest `HttpException` 계열은 본문 모양이 달라지므로 쓰지 않는다. GraphQL 리졸버 오류는 HTTP 200 + `errors[].extensions.code`로 나간다.

## 목록·필드를 N+1 없이

- 항목별 값은 목록 쿼리 한 번에 붙인다: `submissionInclude(viewerId, admin)`처럼 조회자로 거른 관계와 `_count`를 `include`하고, 공개 범위는 `presentSubmission(row, { completed, admin })` 한 곳에서 정한다. 항목마다 필드 리졸버로 다시 조회하지 않는다.
- 노드(Group·Contest)의 비싼·조회자별 필드: 서비스가 `load*` 클로저를 단 노드를 돌려주고, 클로저는 `src/common/batch.ts`의 `siblingLoader(형제 ids, (keys) => in 쿼리 한 번 → Map, 기본값)`로 만든다(`ContestService.loaders`, `GroupService.membersLoader`). `@ResolveField`는 `parent.loadX()`만 부르므로 선택될 때만, 목록당 한 번 계산된다.
- Map은 es-toolkit으로 만든다(`groupBy` + `mapValues` → `new Map(Object.entries(…))`, `keyBy`, `uniq`). `common/`에 일반 유틸을 새로 만들지 않는다.
- 페이지로 나누는 목록은 `submissions`처럼 `offset`·`limit` 인자를 `pageRange()`(offset ≥ 0, limit 1~`PAGE_SIZE_MAX`)로 받고, 정렬의 마지막 열을 `id`로 고정해 같은 시각의 항목이 페이지 사이에서 흔들리지 않게 한다(`src/submission/submission-sort.ts`). 커서·Relay 연결로 바꾸지 않는다(사용자 결정).
- 좋아요·표 수 같은 개수는 읽을 때 `_count`로 센다. 카운터 열을 만들어 올리고 내리지 않는다(사용자 결정).

## 이벤트·설정

- 데이터를 바꾸는 트랜잭션 안에서 `recordEvent(tx, { id, type, userId, properties })`(`src/analytics/analytics-event.ts`)를 부르고, 새 이름은 `ANALYTICS_EVENT`에 snake_case로 더한다. `id`는 같은 사실이면 같은 값(`like:<submissionId>:<userId>`, `joined:<groupId>:<userId>`)이라 재시도·동시 요청에도 한 행만 남는다. `properties`는 ID와 숫자만. 읽기 이벤트(`result_viewed`)는 `this.db`로 남긴다.
- 환경변수는 `src/config/env.ts`에 getter 함수로 더해 호출할 때마다 `process.env`를 읽는다(모듈 최상위 상수로 잡지 않는다 — 테스트가 실행 중에 바꾼다). 운영 필수 값은 `assertProductionConfig()`에, 키는 `../../.env.example`에 더한다. 숫자는 `src/config/limits.ts`(`*_MS`는 `MINUTE_MS`·`DAY_MS`로 조합, 글자 수는 `TEXT_LIMIT`).

## REST

- 웹·앱은 같은 origin의 `/backend/<path>` 프록시로 부르므로 응답에 넣는 API 경로는 `/backend/…`다(`photoUrl()`).
- POST 기본 상태는 201 — 계약이 200이면 `@HttpCode(HttpStatus.OK)`. 쿠키를 쓰면서 JSON을 돌려주면 `@Res({ passthrough: true })`. 고정 경로를 파라미터 경로보다 먼저 선언한다(`@Get('config')` → `@Get(':provider')`).
- 상태를 바꾸는 요청을 GET으로 만들지 않는다(Origin 검사가 GET을 통과시킨다). JSON 본문은 `MAX_JSON_BODY`(64kb)까지이며 파일 본문을 받는 경로는 두지 않는다(저장소 서명 POST). `Cache-Control: private, no-store`를 덮어쓰지 않는다.

## 설정 표·닫힌 분기

- 모듈 최상위의 설정·조회 표(한도, 쓰기 제한 규칙, 메시지 표, 역할·단계별 표, 저장소·미디어 형식 표)는 `const X: T = …` 대신 `satisfies`로 모양을 검사한다. 리터럴 타입이 필요하면 `as const satisfies T`(`WRITE_RATE_LIMIT`), 닫힌 집합을 키로 쓰면 `satisfies Record<TUnion, V>`로 빠진 키·남는 키를 막는다(`submission-sort.ts`의 `ORDER_BY`, 프로필 `EXTENSION`).
- 그대로 두는 것: 유니온의 출처인 enum 대용 객체(`GROUP_ROLE`·`PHASE`·`ERROR_CODE`), Prisma 인자·Nest/GraphQL 데코레이터·zod 스키마로 바로 넘기는 객체, 테스트 fixture, 호출자가 기대는 공개 타입.
- 같은 판별값(단계·역할·공개 범위·알림 종류·업로드 용도·오류 코드)으로 세 갈래 이상 나뉘는 if/삼항·switch는 ts-pattern `match(x).with(…).exhaustive()`로 쓴다. 저장된 문자열·Prisma 오류 코드 같은 열린 입력만 `.otherwise()`(`toGroupRole`, `transactionFailure`). 권한 가드·`if (!row) fail(…)` 같은 조기 반환, 조건 하나짜리 분기, 요청마다 많이 도는 루프(`query-cost.rule.ts`)는 일반 코드로 둔다.

## 체크리스트

- [ ] `app.module.ts`에 등록했고 resolver·controller는 조회자 + 위임만 한다
- [ ] 권한은 `MembershipService`, 트랜잭션 안이면 `{ client: tx }`
- [ ] 목록 항목마다 쿼리가 없다(`include`·`siblingLoader`), 스키마 필드가 모두 채워진다
- [ ] 쓰기와 같은 트랜잭션에 `recordEvent`, 개인정보 없음
- [ ] env getter·`limits.ts` 상수·`.env.example`
- [ ] 구현 파일 옆 `*.integration.spec.ts`에 권한·오류 code·HTTP 상태 테스트([api-test](api-test.md) 문서)
- [ ] `yarn workspace @photo-contest/web codegen`(웹 문서가 없는 필드를 쓰면 실패) → `yarn workspace @photo-contest/web typecheck` → `yarn workspace @photo-contest/web test:api`. 생성된 `../web/src/shared/api/generated.ts`는 [commit](../../../../../../.agents/skills/commit/SKILL.md) 스킬대로 다룬다
- [ ] `yarn workspace @photo-contest/api typecheck`·`test`·`test:integration`, `yarn workspace @side/photo-contest exec eslint apps/api`
