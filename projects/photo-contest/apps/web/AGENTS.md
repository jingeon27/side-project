<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Web (Next.js 16 · Apollo Client 4 · Base UI)

화면·상태·레이어는 `../../.agents/skills/frontend/SKILL.md`, 테스트 격리는 `../../.agents/skills/testing/SKILL.md`를 따른다. 위 Next.js 자동 안내는 유지한다.

## 구조

- `app`: 라우트·레이아웃·로딩/오류·proxy. 화면은 `@/_pages/<화면>` 배럴로만 가져온다.
- `_pages`: home·explore·me·group·group-contests·group-contest·invite·contest·legal. `@page`가 feature를 조립하고 화면 전용 feed/results/model은 그 아래에 둔다.
- `_app`: Apollo·Bridge·Analytics·Toast·Overlay·기록 providers, 전역 스타일.
- `widgets/bottom-nav`: 모바일·태블릿의 홈·탐색·MY 하단 탭. 데스크톱은 왼쪽 고정 메뉴를 쓴다.
- `features`: 인증·그룹·post(상시 게시물·영상·인기·삭제)·초대·공유와 기존 대회 호환 기능.
- `shared`: 생성 GraphQL 문서·API 링크·router/error/form/bridge 기반·UI.

두 웹 서비스가 공유하는 색·글자·간격 토큰과 UI primitive·`cn`은 루트 `packages/design-system`(`@side/design-system`)이 소유한다. `shared/ui/@core`의 Button·IconButton·TextField·TextArea·Badge·Avatar·Spinner와 `shared/lib/cn.helper.ts`는 기존 import 경로를 유지하는 명시적 re-export다. Next 링크는 공통 패키지의 `/next`, 스타일은 `/styles.css` 공개 경로를 사용한다. 이 앱의 `_app/styles/tailwind.css`는 공통 스타일과 앱 소스를 연결하고 `globals.css`에는 `#pc-main` 토스트 위치만 둔다. ConfirmDialog·BottomSheet의 뒤로 가기, 포털 위치, 비동기 동작은 앱에 남기고 공통 토큰·스타일·버튼을 조합한다.

아이디·비밀번호 가입/로그인은 RHF/Zod 폼과 GraphQL useMutation을 쓰며 구글·카카오 OAuth도 제공한다. 설정을 못 불러와도 직접 로그인 폼은 사용할 수 있다. 업로드는 UploadHttpLink와 파일 mutation을 쓰고 컴포넌트에서 fetch를 호출하지 않는다.

eslint.config.ts도 앱의 타입 검사에 포함한다. 공용 preset은 저장소 `packages/eslint-config/src/base.ts`·`next.ts`·`expo.ts`가 관리한다. 앱 설정은 preset과 경로만 조합하고, 커스텀 규칙은 `src/rules/<분류>/<규칙>/` 폴더에 구현·`<규칙>.spec.ts`·그 규칙만 읽는 `__fixtures__`를 함께 둔다. FSD 공통 분석은 `src/rules/fsd/fsd.helper.ts`가 맡는다. else 없이 가드·조기 반환·ts-pattern으로 분기하며, 한 번 쓰는 이벤트는 JSX에 인라인으로 선언한다.

서버 상태는 Apollo 캐시, 입력은 RHF·Zod, 오버레이는 overlay-kit이다. mutation 오류·시트 열림을 useState로 복제하지 않는다. RSC Cookie는 서버 API 모듈에서만 읽어 요청 헤더에 보내고 클라이언트에 넘기지 않는다.

홈은 `GalleryPostsDocument`로 가입한 모든 그룹의 사진·동영상을 최신순으로 보여 주며 이달의 인기도 독립 조회한다. 가입 그룹은 MY, 공개 탐색·이름 검색은 `/explore`에 둔다. 로그인하면 두 화면에서 공개·비공개를 골라 생성한다. 공개 그룹과 탐색은 proxy 인증 게이트에서 제외한다. 비공개 그룹의 대기·수락·거절 상태는 Apollo가 소유하며 멤버가 되기 전에는 게시물 쿼리를 미리 실행하지 않는다. 그룹 정보는 대회 필드가 없는 `GalleryDocument`로 조회한다. 웹 폭은 최대 1440px이다. 최신 게시물은 모바일·태블릿 최대 540px, 데스크톱 최대 680px의 1열 피드로 보여 준다. 데스크톱(1024px 이상)은 왼쪽 고정 메뉴·중앙 피드·오른쪽 인기 사진, 모바일·태블릿은 하단 메뉴와 피드 위의 인기 목록을 쓴다. 흑백 UI·여백·명확한 글자 위계로 그룹의 성격을 살린다. 제목은 사진 위, 본문은 사진 아래에 바로 보여 준다. 인기 게시물은 순위가 붙은 사각형 미리보기이며 프로필에 스토리를 뜻하는 장식 테두리를 두지 않는다. 바텀시트는 모든 기기에서 화면 하단에 붙고 화면 너비를 채운다. 폼은 검증 조건에 따라 필수·선택 표시와 required/aria-required를 연결한다. 직접 찍은 사진·동영상·합성을 환영한다. 그룹은 상시 운영하며 일반 게시물 또는 접수 중인 그룹 대회 참여를 선택해 여러 게시물을 올린다. 고정 메뉴와 정렬 항목은 JSX로 직접 선언한다.

조회 부모는 `useBackgroundQuery`와 재시도를 소유하고, 섹션 자식은 `QueryRef`를 받아 `useReadQuery`로 읽는다. `AsyncBoundary`를 조회 단위에 두어 로딩·실패가 다른 섹션을 가리지 않게 한다. 인증은 `ViewerBoundary`, 대회 단계는 ts-pattern의 exhaustive 분기, 주기 갱신은 `ContestPhaseSync`가 맡는다. 추가 조회·새로고침은 transition으로 기존 화면을 유지한다. 피드 맨 위에서 당겼다 놓으면 최신·인기를 함께 갱신하며 키보드용 조작도 제공한다. 댓글 시트는 별도 QueryRef·경계를 사용하고 열 때 서버에서 다시 받는다. 댓글 페이지의 refetchWritePolicy는 overwrite로 두어 작성·삭제 뒤 이전 페이지가 남지 않게 한다. 사전 조회가 불가능한 조건부 결과 쿼리, 비공개 그룹의 승인 후 처음 나타나는 피드·관리자 신청 목록은 조회 부모가 `useIsSSR()`이면 `skipToken`을 넘겨 브라우저에서 시작하고, QueryRef가 없는 동안 `AsyncBoundary`와 같은 fallback 요소를 직접 그린다. `ClientOnly`는 조회가 여러 하위 컴포넌트에 퍼진 트리(GroupContentFrame의 비공개 본문)에만 쓴다. 공개 피드는 RSC PreloadQuery로 서버 HTML을 만든다. SEO 조회는 Cookie를 전달하지 않는 `publicQuery`로 분리하고 그룹별 코드는 `_pages/group/@seo`, 대회 목록·명예의 전당은 `_pages/group-contests/@seo`, 상세는 `_pages/group-contest/@seo`와 각 배럴에 둔다. canonical·JSON-LD·공개 그룹 사이트맵 계약은 `docs/seo.md`를 따른다.

인기 목록은 모든 기기에서 순위·64px 사진·내용 순서로 한 줄씩 표시한다. 기존 대회 순위는 사진 아래에 둔다. `/terms`·`/privacy`는 로그인 없이 서버 HTML로 읽을 수 있어야 한다. 운영자·문의처·작성일은 `_pages/legal/@page/model/policy.ts`에서 관리하며, 확인되지 않은 보관·위탁·국외 이전 현황을 확정된 사실로 쓰지 않는다. favicon은 `app/icon.svg` 파일 규약으로 제공한다.

## 검사

- `codegen` → `typecheck` → `lint` → `test`(unit/UI) → `test:api`(생성 문서와 실제 API) → `test:e2e`(Playwright).
- API 레인은 4321, 웹 e2e는 3320/4320이다. 테스트용 사용자·단계·티켓은 /testing API로 준비하고 DB를 직접 수정하지 않는다.
- `build`는 실제 프로덕션 빌드를 확인한다. 개발 서버와 함께 검사하면 NEXT_DIST_DIR을 따로 지정한다.
- 공통 primitive 변경은 `@side/design-system`의 검사와 이 앱의 기존 UI 테스트를 함께 확인한다. 테스트 러너·의존성은 해당 패키지와 앱이 각각 소유한다.
- 운영은 monorepo root를 tracing root로 둔 standalone 서버와 static/public 파일을 사용한다. Docker 검증은 playwright.deploy.config.ts의 test:deploy이며 격리한 HTTPS localhost에서만 실행한다. 배포 스크립트의 외부 CLI 경계·복구·잠금은 test/deployment의 Vitest로 검증한다.
- Playwright는 Pixel 7·iPhone 15(WebKit)·데스크톱·가짜 앱 프로젝트를 가진다. 외부 OS/OAuth만 대체하고 pageerror를 검사한다.

## 앱 스킬

| 작업 | 스킬 |
| --- | --- |
| 화면·라우트·SSR·로그인 게이트·앱 열 | `.agents/skills/page-structure/SKILL.md` |
| 문서·정규화 캐시·offset·낙관적 응답 | `.agents/skills/apollo/SKILL.md` |
| 실제 RHF·Zod 폼과 제출 상태 | `.agents/skills/form/SKILL.md` |
| 시트·대화상자·뒤로 가기·포커스 | `.agents/skills/overlay/SKILL.md` |
| Tailwind 토큰·모바일·안전 영역·사진 | `.agents/skills/styling/SKILL.md` |
| Playwright·격리 서버·외부 경계 | `.agents/skills/e2e/SKILL.md` |

데스크톱에서는 `wide:`(1280px)부터 메뉴 폭을 늘리고 피드·인기 목록을 카드로 구분한다. 그룹 글쓰기는 상단바에, 초대·멤버 정보는 GalleryFeed.sidebar에 둔다. MY는 프로필·그룹을 좌우로 나눈다. 글쓰기는 미디어·내용 2열, 댓글은 원본 게시물·대화 2열이며 시트 외곽은 화면 너비를 채운다. 댓글 시트는 높이 75%로 열리고 헤더 드래그로 안전 영역과 키보드를 제외한 전체 높이까지 확장한다. BottomSheet.Root의 snapPoints와 Base UI가 크기·드래그를 소유하며 스냅 오프셋에 맞춘 하단 패딩으로 입력창을 화면 안에 둔다.

그룹 메뉴는 게시물·대회·명예의 전당을 JSX로 직접 선언한다. 대회 목록·상세·결과는 각각 QueryRef·AsyncBoundary를 갖고 공개 데이터는 RSC PreloadQuery로 HTML을 만든다. 비공개 내용은 GroupContentFrame이 canViewPosts로 막고 ClientOnly로 조회한다. 작성 폼의 PostContestField는 대회 선택 쿼리·필수값을 소유한다. 일반 좋아요와 대회 투표를 구분하고 종료 후만 결과를 조회한다. 역할 변경은 GraphQL mutation 결과와 활성 쿼리 재조회로 반영한다. 새 기능의 단위·실제 API·브라우저 테스트는 `.spec`으로 둔다.

공개 SEO 콘텐츠와 사이트맵만 shared/api/public-cache.policy의 주기·태그로 Next fetch Data Cache를 사용한다. 공개 여부·대회 일정은 no-store로 먼저 확인한다. 개인화된 Apollo SSR·브라우저 전송은 no-store를 유지한다. app/backend/graphql은 JSON mutation의 정상·부분 성공 뒤 expire:0으로 공개 태그를 만료시키고 multipart는 스트리밍한다. sitemap Route Handler는 connection()으로 런타임 Origin을 읽되 force-dynamic으로 명시적 데이터 캐시까지 끄지 않는다. test:cache는 실제 standalone 빌드·4324/3324·격리 DB에서 HIT·무효화·쿠키·업로드를 확인한다.

PostMediaField와 PostLinkField는 파일 또는 링크 하나 이상을 RHF/Zod로 검증한다. 파일 없이 링크만 등록하면 업로드 mutation을 실행하지 않는다. PostAttachments가 파일·첨부 링크 표시를 조립하며 PostLink는 정확한 유튜브 호스트·ID만 클릭 후 iframe으로 재생한다. PostDownloadButton은 PostDownload를 no-cache로 매번 실행하고 파일 저장을 시작한다. 링크 게시물에는 저장 버튼이나 가짜 이미지·미디어 SEO를 만들지 않고 공개 citation만 제공한다. 외부 영상 재생과 첨부 링크 처리 변경은 약관·개인정보 안내에 반영한다.

게시물의 수정·숨기기·삭제는 PostActionsMenu의 Base UI Menu에서 JSX로 직접 선언한다. 작성자·관리자에게만 메뉴를 보이고 숨기기는 관리자 전용이다. EditPostBottomSheet가 RHF/Zod와 카테고리 QueryRef·AsyncBoundary를 소유하며 제목·내용·분류를 함께 저장한다. 댓글은 PostCommentRow·ReplySection·Replies·Composer로 맥락을 나눈다. 원댓글과 한 단계 답글은 PostCommentsDocument의 parentId로 나누고 postCommentCount로 각 목록의 끝을 판단한다. replyCount는 펼침 버튼에, GalleryPost.commentCount는 답글 포함 전체 개수에 쓴다. 답글은 오래된 순이며 캐시 keyArgs에 postId·parentId를 포함한다. 원댓글 삭제 확인창은 답글도 함께 삭제됨을 알린다.

그룹 프로필 편집은 EditGroupProfileBottomSheet의 QueryRef·AsyncBoundary·RHF가 소유하고 사진 선택·미리보기·교체·삭제는 GroupAvatarField로 분리한다. UploadGroupAvatar의 multipart로 준비한 id를 UpdateGroupProfile JSON mutation으로 지정해 공개 Next 캐시 무효화를 유지한다. 사진·소개는 그룹 상단·탐색·MY, 공개 그룹의 SEO에 반영한다. 비공개 그룹에서도 프로필은 탐색에 보인다는 안내를 표시한다. 그룹 대회 개최의 좋아요 한도는 기본 1, 1~100 정수이며 게시물의 대회 라벨·상세 안내에 한도를 표시한다. 좋아요 취소 후 재선택과 별도 최종 투표를 구분한다.
