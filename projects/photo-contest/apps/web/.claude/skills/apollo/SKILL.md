---
name: apollo
description: 웹(apps/web)에서 GraphQL 문서를 쓰고 codegen하거나, Apollo 캐시 정책·사진 목록 페이지네이션·캐시 갱신 helper·낙관적 응답·mutation 오류 처리·조건부/SSR 쿼리를 작성하거나 고칠 때 사용한다.
---

원칙은 `frontend` 스킬의 "상태" 절이다. 스키마를 바꾸는 일은 `contest-api` 스킬을 따른다(웹 작업에서 `apps/api/src/**/*.graphql`을 고치지 않는다).

## 문서·codegen

- 문서는 `src/features/<domain>/api/<domain>.graphql`에만 둔다(codegen documents). 연산 이름은 앱 전체에서 유일하다: `query Contest` → `ContestDocument`·`ContestQuery`·`ContestQueryVariables`, `fragment X on T` → `XFragment`·`XFragmentDoc`.
- 모든 객체 선택에 `id`를 넣는다. 정규화·낙관적 갱신·`cache.identify`가 id로 이어진다.
- `corepack yarn workspace @photo-contest/web codegen` → `src/shared/api/generated.ts`. 손으로 고치지 않고 문서 변경과 같은 커밋에 넣는다.
- `onlyOperationTypes`라 `Submission` 같은 스키마 객체 타입은 생성되지 않는다. props 타입은 `ContestQuery['contest']`나 `XFragment`로, enum은 as const 객체(`SubmissionSort.MostLiked`, `Phase.Voting`)로 쓴다.
- 훅과 `skipToken`은 `@apollo/client/react`에서 import한다(`@apollo/client` 루트는 core라 훅이 없다). `useQuery`·`useMutation`·`useFragment`를 한 번 감쌀 뿐인 훅은 만들지 않고 컴포넌트에서 Document로 바로 부른다.

## 캐시

- 쿼리 식별은 Document + variables다. `refetchQueries`는 `[XDocument]`나 `[{ query: XDocument, variables }]`로만 쓰고 문자열 이름을 쓰지 않는다.
- 자식 컴포넌트에는 DTO 대신 id를 넘기고 `useFragment({ fragment: XFragmentDoc, from: { __typename: 'Submission', id } })`로 읽는다. `complete`가 false면 그리지 않는다.
- 캐시를 손으로 고치는 코드는 `src/features/<domain>/model/<domain>.cache.ts` helper에만 둔다. `(cache: ApolloCache, …)`를 받아 `cache.updateQuery({ query: XDocument, variables }, …)`, 엔티티 일부는 `cache.updateFragment({ id: cache.identify({ __typename, id }), fragment: XFragmentDoc }, …)`로 쓰고 mutation의 `update`에서 부른다. `cache.modify` 필드명 문자열도 helper 밖에서 쓰지 않는다.
- 정책은 `src/features/<domain>/model/<domain>.type-policies.ts`(`TypePolicies`) → feature `index.ts` export → `src/_app/providers/apollo/app.type-policies.ts`의 `mergeTypePolicies(...)` 인자에 더한다. 두 도메인이 같은 타입 옵션·필드를 정의하면 `mergeTypePolicies`가 던지므로 필드마다 주인 도메인은 하나다. 동작은 `app.type-policies.spec.ts`에서 실제 `InMemoryCache`로 단언한다.
- id 없는 객체 배열(`Member`, `LeaderboardEntry`)과 서버가 통째로 주는 목록(`hiddenSubmissions`)은 `merge: false`. 없으면 다시 받을 때 "Cache data may be lost" 경고가 난다.

## 사진 목록 (offset)

- `submissions(contestId, offset, limit, sort)` 정책은 `offsetLimitPagination(['contestId', 'sort'])`(`@apollo/client/utilities`) 한 줄이다. 자리 계산·중복 제거 merge를 직접 만들지 않는다.
- 변수는 `{ contestId, sort, offset: 0, limit: 24 }`처럼 sort까지 늘 적는다(생략과 `NEWEST`는 다른 캐시 목록이 된다). 다음 페이지는 `fetchMore({ variables: { offset: data.submissions.length } })`이고, 마지막 응답이 `limit`보다 적거나 불러오는 중이면 부르지 않는다. 화면 끝 sentinel과 "사진 더 보기" 버튼이 같은 함수를 부른다.
- 피드는 polling하지 않는다. 새로고침·앱 복귀·내 사진 제출 뒤에만 다시 받는다.
- 이 정책은 받은 페이지를 `offset` 자리에 덮어쓰고 나머지는 그대로 둔다. 그래서 사진을 목록에서 빼려면(삭제) `updateQuery`로 거르지 말고(끝 항목이 겹친다) `cache.evict({ id: cache.identify({ __typename: 'Submission', id }) })` 후 `cache.gc()`를 부른다. 모든 정렬 목록에서 빠진다. 대회의 `submissionCount` 같은 집계는 같은 helper에서 함께 고친다.

## mutation

- `ErrorLink`(`src/shared/api/apollo-link.helper.ts`)가 mutation 실패를 `getErrorMessage`로 한 번 토스트한다. 조회 실패는 알리지 않는다(화면이 `ErrorState` + `refetch`로 보여 준다). 오류를 화면 안에서 보여 줄 mutation은 `context: { errorToast: false }`, 사용자가 눌러 실행한 조회를 알릴 때는 `context: { errorToast: true }`.
- Apollo 4의 `mutate()`는 `onError`를 줘도 실패하면 reject한다. 항상 try/catch로 감싸고, 토스트가 이미 났으면 catch를 비운다(다시 토스트하지 않는다). 예외: `ConfirmDialog`의 `onConfirm`은 Promise를 그대로 돌려준다(`overlay` 스킬).
- 오류 분기는 `getErrorCode(error) === ERROR_CODE.NotFound`처럼 `@/shared/model/error`로 하고 메시지 문자열을 비교하지 않는다. 진행·실패·성공은 `loading`·`error`·`data`·`called`·`reset()`을 쓰고 useState로 복제하지 않는다.

## 낙관적 응답

- `optimisticResponse`에는 `__typename`과 mutation 문서가 고른 모든 필드를 채운다. `__typename`이 빠지면 정규화되지 않아 기존 엔티티가 바뀌지 않고, 빠진 필드는 "Missing field" 오류와 함께 캐시에 쓰이지 않는다. 생성 타입이 모든 필드를 요구하므로 `as`로 우회하지 않는다.
- 그래서 mutation 문서는 바뀌는 필드만 고른다(좋아요: `id likeCount likedByMe`). 반환이 그 엔티티가 아니면(`castVote` → `Vote`, 신고·숨김·삭제 → `Boolean`) `update`에서 helper로 관련 엔티티를 고친다. `update`는 낙관적 단계에도 돌고 실패하면 Apollo가 그 층을 걷어 내므로 손으로 되돌리지 않는다.
- 토글(좋아요·취소)은 응답을 기다리는 동안 다시 보내지 않는다(`loading`이면 무시). 낙관적 값이 겹치면 수가 어긋난다.

## 조건부·SSR

- 조건부 쿼리는 `useQuery(XDocument, id ? { variables: { id } } : skipToken)`. `skip` 옵션이나 `id!`를 쓰지 않는다.
- 클라이언트 컴포넌트는 SSR 중 GraphQL을 보내지 않는다(`createNoNetworkLink`). `useQuery`는 SSR에서 캐시만 읽어 loading을 그리고, `useSuspenseQuery`는 라우트의 `PreloadQuery`(같은 Document·같은 variables) 없이는 SSR에서 실패한다(`page-structure` 스킬).
- RSC에서 `query()`·`getClient()`로 받은 값을 화면에 직접 그리지 않는다. 브라우저 캐시가 바뀌어도 갱신되지 않는다. 요청 쿠키는 `src/shared/api/apollo-client.server.ts`만 다룬다.

## 확인 (side 루트)

```sh
corepack yarn workspace @photo-contest/web codegen
corepack yarn workspace @photo-contest/web typecheck
corepack yarn workspace @photo-contest/web test       # 캐시 정책·helper spec
corepack yarn workspace @photo-contest/web test:api   # src/**/*.api.spec.ts: 앱 문서를 격리 API(:4321)에 실행
```
