---
name: game-feedback-web-server-state
description: Game Feedback 웹(apps/web)에서 REST 조회·mutation을 추가하거나(features/<domain>/api·model 배치, *.options.ts·*.mutation-options.ts, SDK 응답 검증·오류 문구), 서버 초기 데이터를 React Query 캐시에 잇거나, 사용자별 쿼리 키·로그인/로그아웃/계정 전환 캐시 정리·채팅 SSE와 알림 주기 갱신·앱 lint의 queryKey 규칙 오류를 다룰 때 사용한다.
---

조회 키·mutation 훅·폼의 일반 규칙은 프로젝트 `game-feedback-code-style`과 앱 `AGENTS.md`, 검증은 `game-feedback-test` 스킬을 따른다. 계약은 서버 Zod → OpenAPI → Orval 순서로 바뀌고(프로젝트 `AGENTS.md`) Web은 생성 SDK만 쓴다. 첫 문서 snapshot 흐름은 `game-feedback-web-page-structure` 스킬이다.

## 배치

| 파일 | 내용 |
| --- | --- |
| `features/<d>/api/<d>.api.ts` | 브라우저 SDK 호출(`fetchX`·`postX`), 같은 origin `/api` |
| `features/<d>/api/<d>.server.ts` | `import 'server-only'`, `serverRequestOptions()`(세션 쿠키 + 서명된 방문자 IP) 또는 `publicServerOptions()`(쿠키 없는 공유 조회, API `internal` 버킷), React `cache()`, 404·400 → `notFound()`. 쿠키 없는 공개 조회는 `'use cache'`로 감싼다(`getPublicCategories`, 익명 `getServerSession`) |
| `features/<d>/model/<d>.options.ts` | `queryOptions`·`infiniteQueryOptions` |
| `features/<d>/model/<d>.mutation-options.ts` | `xxxMutationOptions(client, …ids)` |
| `features/<d>/model/<d>.hook.ts` | `useQueryClient()` + `useMutation(options)` 원본 반환 |
| `features/<d>/index.ts` / `index.server.ts` | 클라이언트 공개 / 서버 조회 공개 |

- `@game-feedback/sdk` import는 `src/{_app,_pages,widgets,features,shared}/**/*.tsx`에서 lint 오류다(`no-restricted-imports`). `.ts`는 lint가 막지 않지만 같은 이유로 `api/`에만 둔다.
- SDK는 `packages/sdk/src/index.ts`의 명시적 export 목록만 공개한다. 새 endpoint는 프로젝트 `codegen` 뒤 그 목록에 있어야 import된다. `packages/sdk/src/generated/*`는 손대지 않는다.
- SDK `apiFetch`가 모든 응답을 Zod로 검증한다. 검증 실패는 `ApiResponseValidationError`(`INVALID_API_RESPONSE`), HTTP 실패는 `ApiError(status, errorCode, message)`다. 앱에서 응답을 다시 파싱하거나 fallback을 더하지 않는다(표시 필드 fallback은 SDK `src/response/fallback-policy.ts` 소유).
- 사용자에게 보일 문구를 바꿔야 하는 호출은 `withApiError`(`shared/api/request.ts`)로 감싼다(auth·user·follow·game-profile·support 본보기). AbortError와 응답 검증 오류는 그대로 통과한다. 분기는 `error instanceof ApiError`의 `errorCode`·`status`로 하고 메시지 문자열을 비교하지 않는다(`features/chat/model/chat-error.ts`).
- 서버 API origin은 `GAME_FEEDBACK_API_URL` → `API_ORIGIN` → `http://127.0.0.1:4300`, 타임아웃 10초, 전달 쿠키는 `gamefeedback_session` 하나다(`shared/api/server.spec.ts`).

## 쿼리 키

- 첫 요소가 도메인 식별자다: `['fetchPostList', params]`, `['fetchPostDetail', id]`, `['chat', userId, …]`, `['fetchNotificationList', userId, params]`, `['user-follow', viewerId, userId]`. `['session']`은 세션 전용이다. 다른 키를 `session`으로 시작하지 않는다(계정 전환 때 `session` 외 전부 지운다).
- 오버로드 factory: 인자 없이 부르면 `queryFn: skipToken`인 prefix scope(무효화·취소 전용), 인자가 있으면 실제 options를 돌려준다(`postListOptions`·`postDetailOptions`·`notificationListOptions`·`followStatusOptions`). 무효화는 `client.invalidateQueries(postListOptions())`처럼 factory 결과를 넘긴다. `userPostListOptions`는 `fetchPostList` prefix를 공유해 목록 무효화에 함께 걸린다.
- 로그인 사용자 데이터 키에는 사용자 id를 넣어 다른 계정 캐시를 건드리지 않는다(`chat-cache.spec.ts`, `notification.options.spec.ts`). 조회에 필요한 id가 없으면 `skipToken`(`conversationBadgeOptions`, `notificationSummaryOptions`).
- 앱 lint(`eslint.config.ts` `no-restricted-syntax`)는 `useQuery`·`useSuspenseQuery`·`useInfiniteQuery`·`useSuspenseInfiniteQuery` 인자의 `queryKey: [...]` 리터럴과 `invalidateQueries`·`refetchQueries`·`cancelQueries`·`removeQueries`·`resetQueries`·`getQueriesData`·`setQueriesData`의 `{ queryKey: [...] }` 리터럴을 막는다. factory를 spread하고 화면별 옵션(`throwOnError`·`initialData`·`refetchInterval`)만 덧붙인다.
- QueryClient 기본값은 `_app/providers/Providers.tsx`(staleTime 15초, retry 1, 창 포커스 재조회)이고 서버 세션을 `setQueryData(sessionOptions().queryKey, initialSession)`로 심는다.

## 서버 초기 데이터 연결

- 공개 목록·상세·프로필은 `useInfiniteQuery`/`useQuery` + `throwOnError: true` + `initialData`다. `initialData`는 서버 snapshot의 viewer id와 현재 세션 id가 같을 때만 준다(차단·작성자 전용 정보가 계정마다 다르다). 목록은 조회 조건까지 같아야 하고 `initialDataUpdatedAt: 0`으로 곧바로 다시 받는다. 상세·프로필은 `refetchOnMount: 'always'`.
- 오류는 `if (query.error && !query.isFetching) throw query.error`로 경계에 넘긴다. 재조회 중에는 기존 화면을 유지한다.
- 서버 초기 데이터가 없는 쿠키 의존 조회는 `AsyncBoundary clientOnly` + `useSuspenseQuery`/`useSuspenseInfiniteQuery`다(`MyPosts`, `NotificationsPage`, `MessagesPage`, `FollowControls`). SSR 중에는 fallback만 그려 세션 없이 요청하지 않는다.

## 계정 전환

- 로그인·온보딩·테스트 로그인·네이티브 로그인 성공은 `replaceSession(client, session)`이다: `cancelQueries()` → `session` 외 `removeQueries` → `setQueryData(session)`. 로그아웃·탈퇴는 `clearAuthenticatedSession`이다. 순서를 바꾸면 이전 계정 응답이 새 캐시에 들어간다.
- `sessionOptions().queryFn`과 `refreshSession`(앱 복귀)은 그 사이 로그인/로그아웃이 끝났으면 늦게 온 응답을 버린다(`session-cache.spec.ts`). 세션을 읽는 다른 경로를 만들지 않는다.
- 사용자 경계는 `OverlayProvider key={user id}`(열린 모달 제거), `ChatRealtimeProvider userId`(SSE 재연결), 영역 경계 `resetKey`의 user id다.

## 실시간·주기 갱신

- SSE는 채팅 하나다: `features/chat/model/chat-realtime-connection.ts`의 `ChatRealtimeConnection` + `useChatRealtime`(useSyncExternalStore), `widgets/chat-realtime`이 연결 상태(`connecting`·`live`·`retrying`·`offline`)를 Context로 준다.
- `/api/chat/events`의 `invalidate` 이벤트(`{ conversationId | null }`)만 받아 그 사용자의 대화 목록·메시지 쿼리를 무효화한다. 메시지 내용은 항상 REST로 다시 받는다. 연결·온라인 복귀·화면 복귀 때도 무효화해 놓친 메시지를 복구한다.
- 401·403은 재시도하지 않고 세션을 다시 읽는다(`onSessionStale`). 그 외 실패는 최대 30초 지수 backoff이며 `retry-after`(최대 60초)가 더 길면 그 값을 쓴다. 구독자가 0이 되면 dispose한다. 동작은 `chat-realtime-connection.spec.tsx`가 검증한다.
- 연결이 `live`가 아니면 대화 목록·배지·메시지가 `refetchInterval: 10_000`으로 대신 갱신한다. 알림은 SSE가 없고 `notificationListOptions`·`notificationSummaryOptions`의 30초 주기다.

## mutation

- `onSuccess`에서 무효화 Promise를 반환해 캐시 갱신이 끝날 때까지 pending을 유지한다. 지운 데이터(대화 기록 삭제)는 `cancelQueries` → `resetQueries` → 목록 무효화 순서다.
- 채팅 재전송은 직전 실패 `mutation.variables`(같은 본문·첨부)를 다시 보내 `clientMessageId`를 유지하고, 내용이 바뀌면 새 `crypto.randomUUID()`를 만든다(`_pages/messages/model/use-chat-composer.ts`). 읽음은 화면에 보인 마지막 메시지 경계만 보낸다(`use-visible-read.ts`).
- mutation 단위 테스트는 실제 `QueryClient`로 무효화 범위를 단언한다(`post.options.spec.ts`, `chat.mutation-options.spec.ts`).

## 확인 (side 루트)

```sh
corepack yarn workspace @game-feedback/web lint
corepack yarn workspace @game-feedback/web test --project unit
corepack yarn workspace @game-feedback/web test src/features/chat src/features/auth src/shared/api
corepack yarn workspace @side/game-feedback codegen   # 계약·SDK가 바뀌었을 때
```
