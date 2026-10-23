# Photo Contest (웃긴순간)

상위 `side`의 Yarn workspaces에 속한다. 이 저장소의 구조·규칙·공개 API를 기준으로 구현하며 외부 저장소의 서버 주소, 환경변수 값, 사내 데이터, 코드 파일을 가져오지 않는다.

## 구성

| 경로 | 워크스페이스 | 역할 |
| --- | --- | --- |
| `apps/api` | `@photo-contest/api` | NestJS 12 schema-first GraphQL + REST(인증·업로드·사진·헬스), Prisma 7 + PostgreSQL |
| `apps/web` | `@photo-contest/web` | Next.js 16 App Router, 모바일 우선 반응형 웹(최대 1440px), Apollo Client 4, Base UI |
| `apps/mobile` | `@photo-contest/mobile` | Expo SDK 57 WebView 셸. 웹을 감싸고 브리지로 네이티브 기능을 제공 |
| `packages/bridge` | `@photo-contest/bridge` | 웹 ↔ 앱 메시지 계약(zod). web·mobile만 쓴다 |
| `packages/test-kit` | `@photo-contest/test-kit` | 격리 DB 스키마·테스트용 API 기동·테스트 이미지, 로컬 개발·테스트용 S3 호환 대역. 운영 코드에서 쓰지 않는다 |

각 앱의 `AGENTS.md`가 그 앱의 구조·실행·테스트를 정한다. 작업 전에 해당 앱 문서와 아래 스킬을 읽는다.

## 공통 규칙

- else 문은 쓰지 않는다. 가드·조기 반환이나 ts-pattern으로 분기한다. ESLint 구현과 설정은 TypeScript로 작성한다. 공용 ESLint 규칙과 RuleTester fixture는 저장소의 `packages/eslint-config`가 소유한다.
- named export, 명시적 re-export. `export *` 금지. Next 라우트·설정 파일만 default export.
- 컴포넌트와 공개 함수는 function 선언, 내부 함수는 arrow. 한 곳에서만 쓰는 이벤트 핸들러는 JSX prop에 인라인으로 선언한다. 여러 곳에서 재사용할 때만 함수로 분리하며, 분리한 핸들러는 `handle*`, props 콜백은 `on*`로 이름 짓는다.
- `interface I*`, `type T*`. enum 대신 `as const`. `any`와 non-null `!` 금지(테스트 제외).
- 주석은 코드가 말하지 못하는 '왜'만 짧게 한국어로.
- 생성 파일은 손으로 고치지 않는다: GraphQL 타입은 `codegen`, Prisma client는 `db:generate`.
- 계약은 한 곳에서 바꾼다: GraphQL은 `apps/api/src/**/*.graphql`(web codegen의 입력), 웹 ↔ 앱 메시지는 `packages/bridge`, DB는 Prisma 마이그레이션.
- 패키지를 추가하면 Yarn 24시간 격리 게이트를 통과한 버전인지 확인한다. 모바일은 Expo가 고정한 버전(`expo install` 기준)을 따른다.
- Next.js API는 설치된 `node_modules/next/dist/docs`에서 확인한다. Expo·React Native 라이브러리는 설치된 타입 정의를 기준으로 한다.

## 제품 방향

상시 그룹 커뮤니티다. 제품 표기는 그룹이며 Group 모델·/groups URL을 쓴다. 종료일·1인 1장 제약 없이 제목·내용과 사진/동영상을 등록한다. 홈은 가입한 그룹 전체의 최신 게시물과 이달의 인기(KST)를, MY는 내 그룹 목록·생성을 제공한다. `/explore`는 로그인 없이 공개·비공개 그룹의 이름·멤버 수를 탐색한다. 공개 그룹의 게시물·댓글·미디어는 익명 조회하며 가입은 로그인 후 즉시 처리한다. 비공개 그룹의 내용은 승인된 멤버만 보고 OWNER·MODERATOR가 신청을 수락·거절한다. 초대 링크도 같은 승인 규칙을 적용한다. 기존 그룹은 PRIVATE를 유지한다. Post·PostUpload·PostLike가 현재 게시물 도메인이고 Contest는 format=POST인 그룹 대회와 format=LEGACY인 이전 대회를 구분하며 Submission은 이전 링크·데이터 호환용이다. 새 그룹 대회는 Post.contestId로 참여하며 사진·동영상·여러 게시물을 허용한다.

## 정해진 결정

- 인증: HttpOnly 세션 쿠키 하나. 운영(https)은 `__Host-contest_session`(Secure·Path=/·Domain 없음), 개발·테스트(http)는 `contest_session`이다. API는 cookie-parser 없이 요청 `Cookie` 헤더를 직접 파싱하고 요청당 한 번만 조회한다. 웹 `proxy.ts`는 요청 쿠키로 멤버 전용 화면을 막고, SSR은 요청의 Cookie 헤더를 API로만 넘긴다. 앱 WebView도 같은 쿠키를 쓰고 토큰을 네이티브로 넘기지 않는다.
- 앱 소셜 로그인: Google이 WebView 로그인을 막으므로 시스템 브라우저 + PKCE + 일회용 코드 교환(`/auth/app/exchange`). 코드는 검증된 https App Link·Universal Link(`<WEB_ORIGIN>/app-auth/callback`)로만 받는다. 커스텀 스킴은 로그인 밖의 딥링크에만 쓴다(같은 스킴을 등록한 앱이 자기 challenge로 시작한 흐름의 코드를 가로챌 수 있다). 웹이 `/.well-known/apple-app-site-association`·`assetlinks.json`을 배포 환경변수로 제공하고, iOS 최소 버전은 17.4다.
- 모니터링: API는 Sentry만(도메인 이벤트는 DB에만 기록), 웹·모바일은 Sentry + Amplitude. 키가 없으면 아무것도 보내지 않는다.
- 좋아요 수는 항상 공개. 초대 링크는 모든 멤버가 공유하고 재발급은 OWNER만. 게시물은 작성자와 관리자만 삭제한다. 새 대회와 기존 대회의 득표수는 종료 후 공개한다. OWNER·MODERATOR는 개최·게시물/댓글 삭제·가입 승인·멤버 내보내기(MODERATOR는 MEMBER만)를 하고, OWNER만 부관리자 임명/해제·관리자 양도·초대 재발급을 한다. OWNER는 내보낼 수 없고 양도한 뒤에만 그룹을 나간다. 양도한 OWNER는 MEMBER가 된다.
- 서버 상태는 Apollo(정규화 캐시가 단일 출처). TanStack Query로 바꾸지 않는다.

## 스킬 (관련 작업 전에 해당 파일 전체를 읽는다)

- 웹 구조·화면·폼·Apollo·오버레이: `.agents/skills/frontend/SKILL.md`
- API 모듈·권한·대회 규칙·인증: `.agents/skills/contest-api/SKILL.md`
- 모바일 앱(Expo WebView 셸): `.agents/skills/mobile/SKILL.md`
- 웹 ↔ 앱 메시지 추가·변경: `.agents/skills/bridge/SKILL.md`
- Sentry·Amplitude·이벤트 추가: `.agents/skills/monitoring/SKILL.md`
- 테스트 레인·격리 DB·포트: `.agents/skills/testing/SKILL.md`
- 커밋 단위·메시지: `.agents/skills/commit/SKILL.md`

다른 프로젝트나 사용자의 개발 서버(웹 3200, API 4200, DB 55432) 프로세스를 끄거나 재시작하지 않는다.

운영 배포는 `docs/deployment.md`·`deploy/`를 따른다. 앱 Dockerfile은 앱 안에, 운영 Compose·Caddy·배포/백업 스크립트는 deploy에 둔다. 배포 스크립트의 Vitest와 컨테이너 Playwright는 apps/web/test/deployment가 소유한다. CI가 검증한 동일 이미지의 digest를 배포하며 운영 브랜치·활성화 값이 없으면 GHCR 게시·서버 접속을 하지 않는다. DB volume을 지우거나 DB를 자동으로 되돌리지 않는다. 미디어는 서버 volume이 아니라 비공개 버킷에 있다.

게시물 첨부는 파일 또는 HTTP·HTTPS 링크 중 하나 이상이다. Post.uploadId는 nullable, linkUrl은 선택이며 링크만 있으면 kind=LINK·mediaUrl=null이다. 모든 미디어 업로드·조회는 S3 presigned URL로만 처리하며 API는 파일을 받거나 읽거나 변환·중계하지 않는다(발급 시 권한·형식·크기, 완료 시 HEAD만). `/media/:id` 등 고정 경로는 읽기 권한을 확인한 뒤 `private, no-store` 307로 60초 서명 GET에 보내고, postDownload도 같은 60초 서명 URL을 반환한다. 서명 URL은 조회할 때마다 새로 받고 Apollo·Next 공개 캐시에는 고정 경로만 넣는다. 로컬 개발·테스트는 test-kit S3 대역을 쓴다. 링크 URL로 서버가 외부 메타데이터를 가져오지 않는다. 전체 계약·투네이션 확인 범위는 docs/post-attachments.md를 따른다.
