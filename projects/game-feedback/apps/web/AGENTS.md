<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


## Web FSD와 코드 규칙

- `src/app`은 Next 라우트 어댑터만 둔다. 화면은 `_pages`, 앱 조합·Provider·전역 스타일은 `_app`, 여러 화면의 조합 UI는 `widgets`, 서버 도메인은 `features`, 도메인 비의존 코드는 `shared`가 소유한다. `entities` 레이어를 별도로 만들지 않는다.
- features의 `api`는 REST SDK와 요청·응답 IO, `model`은 query options와 mutation 훅을 소유한다. 페이지의 폼·흐름·URL 상태를 features의 서버 상태와 분리한다. GraphQL을 추가하지 않는다.
- 다른 slice는 명시적인 named export `index.ts`를 통한다. server-only REST·메타데이터 진입점은 공통 FSD lint가 허용하는 `index.server.ts`/`index.server.tsx`에서 공개하며 client barrel에 재수출하지 않는다. 상위 레이어 import·자기 barrel import·페이지 간 직접 import는 금지한다.
- `*.options.ts`의 `queryOptions`/`infiniteQueryOptions`가 쿼리 키의 단일 출처다. 조회·무효화·캐시 쓰기는 같은 factory를 재사용한다. 인자가 없으면 prefix, 조회에 필요한 인자가 없으면 `skipToken`을 사용한다. 서버 조회를 감싼 전용 useQuery 훅은 만들지 않는다.
- mutation은 도메인의 `*.mutation-options.ts`에서 `mutationOptions`로 key·IO·캐시 무효화를 정의하고 named public export로 공개한다. mutation 훅은 이 팩토리를 연결해 원본 useMutation 결과를 반환한다. 대기·오류·재시도 변수는 mutation 상태, 폼은 RHF+Zod `useZodForm`, 모달은 overlay-kit으로 관리한다. 서버 데이터를 전역 UI store나 useState로 복제하지 않는다.
- 조회 대기·실패는 `useSuspenseQuery`/`useSuspenseInfiniteQuery`와 영역별 `AsyncBoundary`(Suspense + ServiceErrorBoundary)로 처리한다. 브라우저 쿠키에 의존하며 서버 초기 데이터가 없는 조회만 clientOnly로 지연한다. 이미 서버 초기 데이터가 있는 공개 상세/프로필은 useQuery + throwOnError와 오류 경계를 사용해 Suspense streaming이 JavaScript 없는 본문을 가리지 않도록 한다. mutation 실패는 초안을 보존하는 폼 안에서 처리한다.
- 게시글 상세의 서버 조회는 모든 사용자가 쿠키 없이 받은 공개 응답을 `'use cache'`(`posts`·`post:<id>` 태그, `cacheLife('max')`)로 함께 쓴다. NestJS 쓰기는 데이터 변경과 무효화 태그를 같은 트랜잭션에 기록하고, 커밋 후 인증된 Next Route Handler의 `revalidateTag(tag, { expire: 0 })`를 호출한다. 실패한 요청은 DB 큐에서 재시도한다. API는 이 콜백을 응답 전에 기다리므로 쓴 사람의 다음 요청도 새 데이터를 받는다. 브라우저가 부를 수 있는 캐시 만료 Server Action(`updateTag`)은 두지 않는다. 작성자 화면은 React Query 무효화로 갱신하고, 서버 컴포넌트가 그린 값(제목·메타데이터)이 바뀌는 쓰기 뒤에는 `router.refresh()`로 현재 라우트의 Client Cache를 비운다(`EditPostSheet`). 로그인 요청은 API의 `/_internal/visibility/excluded-authors`(브라우저가 닿지 않는 경로)로 양방향 차단 관계를 받아 작성자면 404, 답변·댓글이면 제외한다. 차단 목록을 브라우저 응답에 싣지 않는다. 캐시 함수 안에서 cookies·세션을 읽거나 사용자별 값을 인자로 받지 않는다.
- `useRef`는 이전 경로나 외부 동기화의 식별자가 꼭 필요한 곳에 제한한다. DOM 연결은 정리 가능한 callback ref와 useCallback을 우선하고, 표시 상태·mutation 변수를 ref로 복제하지 않는다. 날짜 계산/비교/날짜 구분은 `shared/lib/date`의 dayjs helper를 사용하며 표시 시간대는 Asia/Seoul로 일치시킨다. 사용자별 locale을 전역 dayjs.locale로 변경하지 않는다.
- SSE·DOM observer 등 외부 동기화에만 effect를 사용한다. 필터·선택 대화는 URL을 단일 출처로 사용한다.
- 홈은 모든 게시판/게임의 피드이고 종류별 메뉴는 모든 게임이 같은 5개 설정을 사용한다. 게임을 UI에 하드코딩하지 않고 활성 카테고리와 game 경로 문맥을 전달한다. 코칭 모집 역할/시간당·월 단위·목표 달성 총수강료는 계약의 coaching, 친추판매 금액은 friendSale 메타데이터로 저장하며 본문에서 추측하지 않는다. 기존 가격 미등록과 명시적 가격 협의를 구분한다.
- 게시판 종류는 계약의 board 값과 features/board의 경로/문구를 사용한다. 검색과 상세의 게시판 문맥은 공유 appRoutes로 전달한다. 새 상세 링크와 canonical 직접 진입 모두 논리적 상위 게시판으로 복귀해야 한다.
- 글 본문은 Quill Delta의 허용된 문자열/속성, 업로드한 같은 origin의 사진/동영상 참조와 평문을 함께 저장하고 서버에서 일치를 검증한다. 사용자 HTML을 dangerouslySetInnerHTML로 렌더하지 않는다. 편집기는 client에서 지연 로드하고 callback ref 수명을 정리한다. 채팅 업로드는 도메인 mutationOptions, 미디어는 인증된 같은 origin URL을 사용한다. 모바일 키보드에서 Enter 전송을 강제하거나 Shift+Enter 안내를 표시하지 않는다.
- 컴포넌트 파일은 PascalCase, 나머지는 kebab-case다. named function 컴포넌트, `I` interface·`T` type, 내부 `handle*`·prop `on*`를 사용한다. any·non-null assertion·else·enum을 추가하지 않는다.
- 계정 전환은 실행 중 query 취소 → 이전 계정 cache 제거 → 새 세션 저장 순서를 지킨다. SSE는 사용자 ID별로 닫고 다시 연결한다. 재전송 UUID·실패 초안·읽음 경계를 보존한다.
- `lint`는 공유 Next·FSD preset과 앱의 query-key 규칙을 실제 검사한다. `@side/game-feedback check`에도 포함된다. Vitest와 Playwright는 Web이 소유한다.


## 공통 디자인 시스템

- Photo Contest 웹과 `packages/design-system`의 `@side/design-system`을 사용한다. 공식 shadcn/ui Base UI/base-nova 소스와 components.json 설정은 공통 패키지가 소유하며 웹 설정의 ui/utils alias도 그 패키지를 가리킨다. 보이는 폼 컨트롤은 Input/Textarea/NativeSelect/Checkbox를 사용하고 hidden/file 입력과 Quill 전용 DOM만 해당 구현을 유지한다. Checkbox는 RHF Controller로 연결하고 피드 Tabs는 URL을 제어값으로 사용한다. 공통 색·타이포·모서리·컨트롤·Dialog·cn은 패키지가 소유한다.
- CSS 진입점은 `_app/styles/tailwind.css`이며 공통 styles를 가져온 뒤 앱 도메인별 CSS를 components 레이어로 구성한다. 공통 토큰과 버튼·입력·모달 표현을 앱에서 중복 정의하지 않는다.
- 앱 고유 게임 카드 표현과 화면 레이아웃은 앱에 둔다. Next ButtonLink는 `@side/design-system/next`를 사용하고, 폼 제출 버튼은 type="submit"을 명시한다.
- 실제 데이터에 근거하지 않는 LIVE/ACTIVE 상태, 장식용 점과 가운데 점, 불필요한 영문 대문자 라벨과 별/궤도/떠 있는 카드 장식을 추가하지 않는다. 읽지 않은 항목은 숫자나 문구로 표시하고 실제 SSE 상태는 텍스트로 전달한다. 사용자 콘텐츠 원문은 바꾸지 않는다.

- 게임 프로필은 사용자 계정 설정에서 등록하며 글쓰기에 첨부하지 않는다. 인증 문의는 기존 관리자 1:1 대화로 연결하고 인증은 관리자가 수동 승인한다. 대표 태그 변경은 인증을 해제한다. /:locale/admin은 문의함, 신고 검토, 인증과 밴/해제를 제공하며 API에서도 관리자 권한을 검증한다. 밴 중에도 관리자 문의는 유지한다.

## 앱 스킬

| 작업 | 스킬 |
| --- | --- |
| 화면·라우트·`@topbar`·첫 문서 데이터·SEO·오류 경계 | `.agents/skills/game-feedback-web-page-structure/SKILL.md` |
| 링크·뒤로 가기·게시판 문맥·URL 상태·locale·앱 WebView 연동 | `.agents/skills/game-feedback-web-navigation/SKILL.md` |
| REST 조회·mutation·쿼리 키·계정 전환·채팅 SSE | `.agents/skills/game-feedback-web-server-state/SKILL.md` |
| 글쓰기·Quill 본문·사진/동영상·채팅 첨부 업로드 | `.agents/skills/game-feedback-web-compose-media/SKILL.md` |
| Playwright 설정·격리 서버·로그인·한 spec 실행 | `.agents/skills/game-feedback-web-e2e/SKILL.md` |
