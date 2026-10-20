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
- 같은 화면의 조회 섹션을 나눌 때는 `QueryRef`를 전달하고 `useReadQuery`로 읽는다. 조회 결과를 Context나 별도 상태로 복제하지 않는다. 조회 부모의 `useBackgroundQuery`가 요청·재시도를 소유하고, 자식은 `useQueryRefHandlers`로 같은 조회의 추가 요청·갱신을 실행할 수 있다.
- 캐시를 손으로 고치는 코드는 `src/features/<domain>/model/<domain>.cache.ts` helper에만 둔다. `(cache: ApolloCache, …)`를 받아 `cache.updateQuery({ query: XDocument, variables }, …)`, 엔티티 일부는 `cache.updateFragment({ id: cache.identify({ __typename, id }), fragment: XFragmentDoc }, …)`로 쓰고 mutation의 `update`에서 부른다. `cache.modify` 필드명 문자열도 helper 밖에서 쓰지 않는다.
- 정책은 `src/features/<domain>/model/<domain>.type-policies.ts`(`TypePolicies`) → feature `index.ts` export → `src/_app/providers/apollo/app.type-policies.ts`의 `mergeTypePolicies(...)` 인자에 더한다. 두 도메인이 같은 타입 옵션·필드를 정의하면 `mergeTypePolicies`가 던지므로 필드마다 주인 도메인은 하나다. 동작은 `app.type-policies.spec.ts`에서 실제 `InMemoryCache`로 단언한다.
- id 없는 객체 배열(`Member`, `LeaderboardEntry`)과 서버가 통째로 주는 목록(`hiddenSubmissions`)은 `merge: false`. 없으면 다시 받을 때 "Cache data may be lost" 경고가 난다.

## 사진 목록 (offset)

- `submissions(contestId, offset, limit, sort)` 정책은 `offsetLimitPagination(['contestId', 'sort'])`(`@apollo/client/utilities`) 한 줄이다. 자리 계산·중복 제거 merge를 직접 만들지 않는다.
- 변수는 `{ contestId, sort, offset: 0, limit: 24 }`처럼 sort까지 늘 적는다(생략과 `NEWEST`는 다른 캐시 목록이 된다). 다음 페이지는 `fetchMore({ variables: { offset: data.submissions.length } })`이고, 마지막 응답이 `limit`보다 적거나 불러오는 중이면 부르지 않는다. 화면 끝 sentinel과 "사진 더 보기" 버튼이 같은 함수를 부른다.
- 피드는 polling하지 않는다. 새로고침·앱 복귀·내 사진 제출·숨김/삭제 후 다시 받는다. 진행 중인 대회 정보만 로그인한 사용자에게 30초마다 갱신하며 종료·로그아웃 때 멈춘다.
- 홈의 `myPhotoFeed(offset, limit)`는 모든 내 그룹의 공개 사진을 전체 최신순으로 합친 목록이다. `features/feed`가 `offsetLimitPagination()` 정책과 `resetPhotoFeed`를 소유한다. 가입·제출·숨김·삭제 후 캐시를 비워 이전 목록이 남지 않게 한다. 홈은 `MyPhotoFeedDocument`, MY는 `MyGroupsDocument`를 RSC에서 같은 변수로 사전 조회한다.
- 이 정책은 받은 페이지를 `offset` 자리에 덮어쓰고 나머지는 그대로 둔다. 사진 숨김/삭제로 offset이 밀리면 `resetSubmissionFeeds` helper로 모든 정렬 목록을 비우고 `SubmissionsDocument`를 다시 조회한다. 삭제는 엔티티도 evict하고 gc한다. 대회 사진 수·숨긴 목록과 종료 결과는 `moderationRefetchQueries`로 다시 받으며 사진 수 변경 시 화면의 다음 페이지 상태를 초기화한다.
- 피드 조회에는 `refetchWritePolicy: 'overwrite'`를 지정해 첫 페이지 갱신 뒤 예전 뒷페이지가 남지 않게 한다. 관리자의 숨긴 사진도 원본 응답 길이에 포함되므로 offset은 필터 전 길이로 계산한다. 반면 `submissionCount`는 공개 사진 수이므로 마지막 페이지 판단은 공개 카드 수로 한다. 첫 페이지가 모두 숨긴 사진이어도 다음 페이지 조작부를 남긴다. 추가 조회·새로고침은 `useTransition`으로 감싸 기존 사진과 조작부를 유지한다.

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
- 클라이언트 컴포넌트는 SSR 중 GraphQL을 보내지 않는다(`createNoNetworkLink`). `useBackgroundQuery` + `useReadQuery`의 Suspense 조회는 라우트의 `PreloadQuery`와 Document·variables가 같아야 한다. `AsyncBoundary`는 각 조회의 fallback·오류·같은 QueryRef 재시도를 묶는다(`page-structure` 스킬).
- 권한·만료·잘못된 초대처럼 예상되는 오류는 `errorPolicy: 'all'`로 받아 data가 없는 경우 화면에서 분기한다. React 오류 경계는 SSR 예외를 잡지 못한다. 대회 종료 후에만 허용되는 결과처럼 조건부로 시작하고 사전 조회할 수 없는 쿼리는 `ClientOnly` 아래에서 시작한다. 상시 쿼리의 SSR을 피하는 용도로 쓰지 않는다.
- 주기 갱신은 별도 컴포넌트의 `useQuery`로 같은 정규화 캐시를 갱신한다. `ContestPhaseSync`는 30초 간격이며 종료 시 `skipToken`으로 멈춘다. 데이터 표시와 polling 책임을 나누고 피드는 polling하지 않는다.
- RSC에서 `query()`·`getClient()`로 받은 값을 화면에 직접 그리지 않는다. 브라우저 캐시가 바뀌어도 갱신되지 않는다. 요청 쿠키는 `src/shared/api/apollo-client.server.ts`만 다룬다.

## 확인 (side 루트)

```sh
corepack yarn workspace @photo-contest/web codegen
corepack yarn workspace @photo-contest/web typecheck
corepack yarn workspace @photo-contest/web test       # 캐시 정책·helper spec
corepack yarn workspace @photo-contest/web test:api   # src/**/*.api.spec.ts: 앱 문서를 격리 API(:4321)에 실행
```

## 공개 서버 캐시

개인화된 Apollo SSR은 no-store를 유지한다. SEO 공개 여부·대회 일정은 먼저 fresh 조회하고 익명 콘텐츠·사이트맵만 publicQuery의 cacheSeconds와 public-cache.policy로 캐시한다. JSON mutation은 Next /backend/graphql을 거쳐 성공·부분 성공 뒤 공개 태그를 expire:0으로 만료시키며 multipart는 그대로 전송한다. force-dynamic sitemap 설정은 명시적 캐시도 끄므로 connection()으로 런타임 조회를 유지한다. cache 검증은 test:cache의 실제 standalone 서버에서 한다.
