<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Web (Next.js 16 · Apollo Client 4 · Base UI)

화면·상태·레이어는 `../../.claude/skills/frontend/SKILL.md`, 테스트 격리는 `../../.claude/skills/testing/SKILL.md`를 따른다. 위 Next.js 자동 안내는 유지한다.

## 구조

- `app`: 라우트·레이아웃·로딩/오류·proxy. 화면은 `@/_pages/<화면>` 배럴로만 가져온다.
- `_pages`: home·me·group·invite·contest. `@page`가 feature를 조립하고 화면 전용 feed/results/model은 그 아래에 둔다.
- `_app`: Apollo·Bridge·Analytics·Toast·Overlay·기록 providers, 전역 스타일.
- `widgets/bottom-nav`: 모바일·태블릿의 홈·MY 하단 탭. 데스크톱은 상단바 메뉴를 쓴다.
- `features`: 인증·그룹·초대·대회·사진·통합 피드·좋아요·투표·결과·신고·공유.
- `shared`: 생성 GraphQL 문서·API 링크·router/error/form/bridge 기반·UI.

서버 상태는 Apollo 캐시, 입력은 RHF·Zod, 오버레이는 overlay-kit이다. mutation 오류·시트 열림을 useState로 복제하지 않는다. RSC Cookie는 서버 API 모듈에서만 읽어 요청 헤더에 보내고 클라이언트에 넘기지 않는다.

홈은 `MyPhotoFeedDocument`로 가입한 모든 그룹의 사진을 최신순으로 보여 준다. 그룹 목록·생성은 MY에 둔다. 웹 폭은 최대 1200px이고 사진은 휴대폰 1열·태블릿(768px 이상) 2열·데스크톱(1024px 이상) 3열이다. 시트·입력 폼은 읽기 쉬운 폭을 유지한다. 직접 찍은 사진과 합성 사진을 모두 환영한다.

조회 부모는 `useBackgroundQuery`와 재시도를 소유하고, 섹션 자식은 `QueryRef`를 받아 `useReadQuery`로 읽는다. `AsyncBoundary`를 조회 단위에 두어 로딩·실패가 다른 섹션을 가리지 않게 한다. 인증은 `ViewerBoundary`, 대회 단계는 ts-pattern의 exhaustive 분기, 주기 갱신은 `ContestPhaseSync`가 맡는다. 추가 조회·새로고침은 transition으로 기존 화면을 유지한다. 사전 조회가 불가능한 조건부 결과 쿼리만 `ClientOnly`로 감싼다.

## 검사

- `codegen` → `typecheck` → `lint` → `test`(unit/UI) → `test:api`(생성 문서와 실제 API) → `test:e2e`(Playwright).
- API 레인은 4321, 웹 e2e는 3320/4320이다. 테스트용 사용자·단계·티켓은 /testing API로 준비하고 DB를 직접 수정하지 않는다.
- `build`는 실제 프로덕션 빌드를 확인한다. 개발 서버와 함께 검사하면 NEXT_DIST_DIR을 따로 지정한다.
- Playwright는 Pixel 7·iPhone 15(WebKit)·데스크톱·가짜 앱 프로젝트를 가진다. 외부 OS/OAuth만 대체하고 pageerror를 검사한다.

## 앱 스킬

| 작업 | 스킬 |
| --- | --- |
| 화면·라우트·SSR·로그인 게이트·앱 열 | `.claude/skills/page-structure/SKILL.md` |
| 문서·정규화 캐시·offset·낙관적 응답 | `.claude/skills/apollo/SKILL.md` |
| 실제 RHF·Zod 폼과 제출 상태 | `.claude/skills/form/SKILL.md` |
| 시트·대화상자·뒤로 가기·포커스 | `.claude/skills/overlay/SKILL.md` |
| Tailwind 토큰·모바일·안전 영역·사진 | `.claude/skills/styling/SKILL.md` |
| Playwright·격리 서버·외부 경계 | `.claude/skills/e2e/SKILL.md` |
