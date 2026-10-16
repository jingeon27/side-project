# Photo Contest (웃긴순간)

상위 `side`의 Yarn workspaces에 속한다. 세이프닥 저장소(safedoc-usermall·react·global)는 구조와 규칙만 참고한다. 그 저장소의 서버 주소, 환경변수 값, 사내 데이터, 업무 명칭, 코드 파일을 가져오지 않는다.

## 구성

| 경로 | 워크스페이스 | 역할 |
| --- | --- | --- |
| `apps/api` | `@photo-contest/api` | NestJS 12 schema-first GraphQL + REST(인증·업로드·사진·헬스), Prisma 6 + PostgreSQL |
| `apps/web` | `@photo-contest/web` | Next.js 16 App Router, 모바일 우선 반응형 웹(최대 1200px), Apollo Client 4, Base UI |
| `apps/mobile` | `@photo-contest/mobile` | Expo SDK 57 WebView 셸. 웹을 감싸고 브리지로 네이티브 기능을 제공 |
| `packages/bridge` | `@photo-contest/bridge` | 웹 ↔ 앱 메시지 계약(zod). web·mobile만 쓴다 |
| `packages/test-kit` | `@photo-contest/test-kit` | 격리 DB 스키마·테스트용 API 기동·테스트 이미지. 테스트에서만 쓴다 |

각 앱의 `AGENTS.md`가 그 앱의 구조·실행·테스트를 정한다. 작업 전에 해당 앱 문서와 아래 스킬을 읽는다.

## 공통 규칙

- else 문은 쓰지 않는다. 가드·조기 반환이나 ts-pattern으로 분기한다. 공용 ESLint 규칙과 RuleTester fixture는 저장소의 `packages/eslint-config`가 소유한다.
- named export, 명시적 re-export. `export *` 금지. Next 라우트·설정 파일만 default export.
- 컴포넌트와 공개 함수는 function 선언, 내부 함수는 arrow. 한 곳에서만 쓰는 이벤트 핸들러는 JSX prop에 인라인으로 선언한다. 여러 곳에서 재사용할 때만 함수로 분리하며, 분리한 핸들러는 `handle*`, props 콜백은 `on*`로 이름 짓는다.
- `interface I*`, `type T*`. enum 대신 `as const`. `any`와 non-null `!` 금지(테스트 제외).
- 주석은 코드가 말하지 못하는 '왜'만 짧게 한국어로.
- 생성 파일은 손으로 고치지 않는다: GraphQL 타입은 `codegen`, Prisma client는 `db:generate`.
- 계약은 한 곳에서 바꾼다: GraphQL은 `apps/api/src/**/*.graphql`(web codegen의 입력), 웹 ↔ 앱 메시지는 `packages/bridge`, DB는 Prisma 마이그레이션.
- 패키지를 추가하면 Yarn 24시간 격리 게이트를 통과한 버전인지 확인한다. 모바일은 Expo가 고정한 버전(`expo install` 기준)을 따른다.
- Next.js API는 설치된 `node_modules/next/dist/docs`에서 확인한다. Expo·React Native 라이브러리는 설치된 타입 정의를 기준으로 한다.

## 제품 방향

상시 갤러리 커뮤니티다. 제품 표기는 갤러리이며 내부 Group 모델·/groups URL은 호환을 위해 유지한다. 종료일·1인 1장 제약 없이 제목·내용과 사진/동영상을 등록한다. 홈은 가입한 갤러리 전체의 최신 게시물과 이달의 인기(KST)를, MY는 내 갤러리 목록·생성을 제공한다. Post·PostUpload·PostLike가 현재 게시물 도메인이고 Contest·Submission은 이전 링크·데이터 호환용이다.

## 정해진 결정

- 인증: HttpOnly 쿠키 `contest_session` 하나. API는 cookie-parser 없이 요청 `Cookie` 헤더를 직접 파싱하고 요청당 한 번만 조회한다. 웹 `proxy.ts`는 요청 쿠키로 멤버 전용 화면을 막고, SSR은 요청의 Cookie 헤더를 API로만 넘긴다. 앱 WebView도 같은 쿠키를 쓰고 토큰을 네이티브로 넘기지 않는다.
- 앱 소셜 로그인: Google이 WebView 로그인을 막으므로 시스템 브라우저 + PKCE + 일회용 코드 교환(`/auth/app/exchange`).
- 모니터링: API는 Sentry만(도메인 이벤트는 DB에만 기록), 웹·모바일은 Sentry + Amplitude. 키가 없으면 아무것도 보내지 않는다.
- 좋아요 수는 항상 공개. 초대 링크는 모든 멤버가 공유하고 재발급은 관리자만. 게시물은 작성자와 관리자만 삭제한다. 기존 대회의 득표수는 종료 후 공개한다.
- 서버 상태는 Apollo(정규화 캐시가 단일 출처). TanStack Query로 바꾸지 않는다.

## 스킬 (관련 작업 전에 해당 파일 전체를 읽는다)

- 웹 구조·화면·폼·Apollo·오버레이: `.claude/skills/frontend/SKILL.md`
- API 모듈·권한·대회 규칙·인증: `.claude/skills/contest-api/SKILL.md`
- 모바일 앱(Expo WebView 셸): `.claude/skills/mobile/SKILL.md`
- 웹 ↔ 앱 메시지 추가·변경: `.claude/skills/bridge/SKILL.md`
- Sentry·Amplitude·이벤트 추가: `.claude/skills/monitoring/SKILL.md`
- 테스트 레인·격리 DB·포트: `.claude/skills/testing/SKILL.md`
- 커밋 단위·메시지: `.claude/skills/commit/SKILL.md`

다른 프로젝트나 사용자의 개발 서버(웹 3200, API 4200, DB 55433) 프로세스를 끄거나 재시작하지 않는다.
