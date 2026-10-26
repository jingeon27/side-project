---
name: game-feedback-api-auth
description: Game Feedback API의 세션 쿠키·Bearer 토큰 해석, Origin 검사와 요청 제한, OAuth 제공자(Google·카카오·Discord) 추가·변경과 온보딩, 테스트 토큰·데모 로그인(GF_TEST_AUTH_ENABLED·GF_DEMO_MODE), 모바일 로그인 인계(app_challenge·AppLoginTicket·/api/auth/app/exchange), 밴 적용, 관리자 권한을 고치거나 검토할 때 사용한다.
---

엔드포인트 배치는 `game-feedback-api-endpoint`, 테스트 하네스는 `game-feedback-api-test` 스킬, OAuth scope·로그 원칙은 프로젝트 `AGENTS.md`를 따른다. 경로는 apps/api 기준이다.

## 요청 한 건의 경로 (`src/app.ts`)

1. `createHttpAdapter`·`configureHttp`(`src/common/http/configure-http.ts`): 라우팅은 대소문자를 구분한다(`case sensitive routing`은 `ExpressAdapter` 생성 전에 켜야 한다 — 생성자가 라우터를 만든다). `Cache-Control: no-store`·`nosniff`·`Referrer-Policy`, JSON 256kb(깨진 JSON 400, 초과 413 `INVALID_BODY`), 운영에서만 `trust proxy` 1.
2. `ApiAccessMiddleware`(`src/common/http/api-access.middleware.ts`, 경로가 대소문자 무시로 `/api`로 시작하면): health GET·HEAD 통과 → GET·HEAD·OPTIONS 밖은 `assertOrigin`(`Origin === webOrigin`이고 `Sec-Fetch-Site: cross-site`가 아니어야 한다, 아니면 403 `INVALID_ORIGIN`) → 클라이언트 식별 → `coarseRateBucket`(IP당 분당 1000) → `SessionService.loadSession` → 밴 검사 → `requestRateBucket` 제한(429 `RATE_LIMITED` + `Retry-After`). 제한은 `rateLimit` 설정이 켜졌을 때만이다.
   - 클라이언트 식별(`src/common/http/forwarded-client.ts`): Next 서버는 내부 주소로 API를 부르므로 소켓 IP가 항상 웹 컨테이너다. 웹(`apps/web/src/shared/api/server.ts`)은 `X-Forwarded-For` 첫 값(Caddy가 덮어쓴다) 또는 쿠키 없는 공유 조회의 `internal`을 `x-gf-client-ip`·`x-gf-client-timestamp`·`x-gf-client-signature`로 보낸다. 키는 `GF_CACHE_REVALIDATION_SECRET`에서 HMAC으로 파생하고(`AppOptions.forwardedClientSecret`로 덮는다) 60초 창 안의 서명만 믿는다. 서명이 유효하면 그 IP, `internal`이면 별도 `internal` 버킷(조회 분당 3000), 아니면 소켓 IP를 쓴다. 두 구현은 같은 테스트 벡터를 고정한다.
3. Origin이 세션보다 먼저라 Bearer 요청도 쓰기에는 `Origin`이 필요하고, 다른 Origin은 비로그인이어도 401보다 403이 먼저다. 이어서 `ChatLifecycleMiddleware` → Guard → 파이프 → 서비스.

## 세션 (`src/auth/session.service.ts`, `src/auth/session-token.ts`)

- `sessionToken(req)`: `Authorization` 헤더가 있으면 `Bearer <43자 base64url>`만 인정하고 아니면 null이다 — 쿠키로 대체하지 않는다. 헤더가 없을 때만 `gamefeedback_session` 쿠키(`COOKIE`, `src/common/http/cookies.ts`)를 읽는다.
- DB에는 `hash(raw)`(`src/common/crypto.ts`, sha256 hex)만 `Session.tokenHash`로 둔다. `loadSession`은 만료 세션과, 데모·테스트 인증이 모두 꺼진 앱에서 `demoKey` 사용자 세션을 null로 만든다.
- 발급은 `issueSession(req, res, userId, pendingSubject?, { durationMs?, provider? })` 하나로 한다: 현재 토큰 행을 지우고(회전) 새 행을 만든다. 사용자 14일, 온보딩 대기 15분, 테스트 토큰 1시간. 쿠키는 `setCookie`(HttpOnly·SameSite=Lax·Path=/·운영만 Secure), 지울 때도 `setCookie(res, COOKIE, '', 0, production)`.
- 세션을 바꾸는 POST를 새로 만들면 `src/chat/chat-lifecycle.middleware.ts`의 경로 목록에 더해 이전 세션의 SSE를 닫는다.

## 데모·테스트 인증 (`src/config/app.config.ts`, `src/auth/auth.service.ts`)

- `demoMode` = 옵션 ?? `GF_DEMO_MODE === 'true'`, `testAuthEnabled` = 옵션 ?? (`demoMode` || `GF_TEST_AUTH_ENABLED === 'true'`). production이면 `resolveAppConfig`가 throw하고 `validateProductionEnvironment`도 두 값이 `'false'`이길 요구한다. 조건을 넓히지 않는다.
- `TestAuthGuard`·`DemoAuthGuard`(`src/common/http/session.guard.ts`)는 꺼져 있으면 404 `NOT_FOUND`로 존재를 숨긴다. `GET /api/auth/test-accounts`는 Guard 없이 서비스 `requireTestAuth()`가 404를 낸다.
- 테스트 계정은 `src/seed.ts` `TEST_ACCOUNT_FIXTURES`(`sample-user-0`, `sample-user-3`, `sample-test-admin`)뿐이다. 호출마다 `seed(db, true)` 후 `id` + `demoKey`로 찾고, 임의 ID나 권한 플래그를 받지 않는다. `/api/auth/test-token`은 Bearer + 같은 쿠키 + `Cache-Control: no-store`.
- `/api/auth/demo`는 `demoKey: demo:<소문자 닉네임>`으로 upsert한다 — 같은 닉네임이면 같은 사용자다.

## OAuth 제공자

- 계약 `SocialProviderSchema`(`kakao`·`discord`·`google`, `../../packages/contracts/src/index.ts`)와 인터페이스 `IdentityProvider { authorizationUrl({ state, nonce, challenge }), exchange(code, verifier, nonce) → subject }`(`src/auth/providers/identity-provider.ts`).
- 구현: Google은 `GoogleIdentityProvider`(scope `openid`, PKCE, id_token 검증). Discord는 `identify`, 카카오는 scope 없이 ID만 조회한다. 나머지는 `src/auth/providers/oauth-identity.provider.ts`의 `createKakaoIdentityProvider`·`createDiscordIdentityProvider`이며 `subject`를 Zod로 좁히고 실패는 502 `OAUTH_FAILED`.
- 연결: `resolveIdentityProviders`(`src/config/identity-providers.ts`)가 `<PREFIX>_CLIENT_ID`·`_CLIENT_SECRET`·`_REDIRECT_URI`를 읽는다. 기본 redirect는 `${webOrigin}/api/auth/social/<p>/callback`(Google은 `/api/auth/google/callback`) — Web origin의 `/api` rewrite를 거쳐야 state 쿠키가 돌아온다.
- 제공자 추가 순서: `SocialProviderSchema` → 어댑터 팩토리 → `identity-providers.ts` → `production.config.ts`의 `providers` → 프로젝트 `.env.example` → `scripts/test.ts`에서 키 비우기 → `oauth-identity.provider.test.ts` 케이스 → `codegen`. `GET /api/session`의 `socialProviders`는 enum에서 자동으로 만들어진다.

## OAuth 흐름 불변식 (`AuthService.social`·`socialCallback`)

- 시작: 미설정이면 503 `OAUTH_NOT_CONFIGURED`. `app_challenge`는 정확히 43자 `[A-Za-z0-9_-]`, 아니면 400 `APP_CHALLENGE_INVALID`. 만료된 `OAuthAttempt`를 지운 뒤 `stateHash`·`nonce`·`verifier`·`appChallenge`(10분)를 두고 state 원문은 `gamefeedback_oauth` 쿠키로만 준다. 세션도 `issueSession`이 만료 행을 함께 지운다.
- 콜백: 쿼리 state = 쿠키 state, 시도의 provider = 경로 provider, 소비는 `deleteMany({ stateHash, provider, expiresAt: { gt } })`의 `count === 1`(재사용 불가). 어기면 400 `OAUTH_STATE_INVALID`.
- 계정 식별은 `SocialIdentityService.findUser`(`(provider, subject)`, Google만 레거시 `User.googleSubject`)다. 제공자가 달라도 subject로 계정을 합치지 않는다. 없는 계정은 `pendingSubject`·`pendingProvider` 15분 세션 → `/ko?onboard=1` → `POST /api/auth/onboard`(`acceptedTerms`·`ageConfirmed`는 `@Equals(true)`)가 `pg_advisory_xact_lock(hashtextextended('<provider>:<subject>', 0))` 아래에서 사용자를 만든다.

## 모바일 인계 (`src/auth/app-auth.service.ts`)

- 앱 시도면 콜백은 세션 쿠키를 만들지 않는다. `issueTicket`이 만든 코드 원문을 `AppConfig.appAuthCallbackUrl?code=`(검증된 https 앱 링크, 기본 `${webOrigin}/app-auth/callback`)에만 싣고 `AppLoginTicket`에는 `hash(code)`·challenge·subject·provider를 120초 둔다(만료 티켓은 이때 지운다). 제공자 실패는 같은 콜백 `?error=login_failed`.
- 앱 로그인 코드를 커스텀 스킴으로 보내지 않는다. 같은 스킴을 등록한 앱이 자기 challenge로 흐름을 열면 PKCE로도 막지 못한다(감사 M3). `src/config/app-auth-callback.ts`는 `MOBILE_AUTH_CALLBACK_URL`(또는 `AppOptions.appAuthCallbackUrl`)이 WEB_ORIGIN과 같은 origin의 `/app-auth/callback`이고 쿼리·해시·계정 정보가 없을 때만 따른다. 개발·테스트는 아니면 기본값, 운영은 `resolveAppConfig`와 `validateProductionEnvironment`가 시작을 멈춘다. 경로를 바꾸면 bridge `APP_AUTH_CALLBACK_PATH`, 웹 `/app-auth/callback`·AASA·assetlinks, 앱 `app.config.ts`를 같이 바꾼다.
- `POST /api/auth/app/exchange`: `sha256(verifier)` base64url이 challenge와 같아야 한다. 불일치·만료·재사용은 모두 400 `APP_LOGIN_INVALID`. 소비는 비교 뒤 `deleteMany(...).count === 1`이라 틀린 verifier는 티켓을 쓰지 않고 동시 교환은 한 건만 성공한다. 세션은 WebView가 부른 이 응답의 쿠키로만 준다.

## 밴·관리자

- 밴 사용자(`User.bannedAt`)의 쓰기는 `bannedUserMayWrite`(`src/common/http/banned-access.ts`)의 허용 목록(`/api/support/conversations`, `/api/auth/logout`, `DELETE /api/me`, 대화의 `messages|read|attachments` 한 단계 하위, `attachments/:id/complete`)만 통과하고 나머지는 403 `USER_BANNED`. 대화는 `ChatAccessService.visible`이 지원 문의 대화만 남긴다. 밴 사용자에게 새 쓰기 경로를 열려면 이 함수와 `banned-access.test.ts`를 고친다.
- `AdminUsersService.ban`: 대상 행 `FOR UPDATE`, ADMIN 대상은 400 `ADMIN_PROTECTED`, AuditLog `BAN_USER`/`UNBAN_USER`, 커밋 뒤 `ChatEvents.closeUser`.
- 밴 회피 방지(`src/auth/banned-identity.ts`): 밴하면 사용자의 모든 로그인 식별자를 `BannedIdentity(provider, sha256(subject))`에 남기고 해제하면 지운다. 밴 사용자의 탈퇴도 같은 트랜잭션에서 기록한다. 계정이 없는 식별자는 social callback(웹 403 `USER_BANNED`, 앱 `?error=login_failed`), `/api/auth/app/exchange`, `onboard`에서 거부된다. 계정이 남은 밴 사용자는 문의를 위해 로그인할 수 있다.

- `User.role`은 문자열이다(`userDto`는 모르는 값을 `USER`로). 일반 가입·소셜 로그인은 관리자 권한을 부여하지 않는다. 운영 SSH의 `scripts/operator.ts create <id>`는 전용 AdminAccount와 문의용 내부 User를 함께 생성하며 비밀번호를 stdin으로 받는다. 일반 사용자를 승격하지 않는다. 관리자 ID·비밀번호 로그인은 공개 Caddy에서 차단한 `/api/admin/auth/*`에서만 제공하며 AdminSession 쿠키는 `/api/admin`에만 적용한다. 공개 API는 관리자 쿠키나 전용 계정의 일반 Session을 허용하지 않는다. 테스트 ADMIN은 격리 픽스처만 사용하며 HTTP 승격 경로는 만들지 않는다.

## 건드리면 있어야 하는 테스트

- unit: `src/security.test.ts`(Origin·DB URL), `src/rate-limit.test.ts`·`src/rate-limit.spec.ts`, `src/common/http/forwarded-client.spec.ts`, `src/common/http/api-access.middleware.test.ts`(대소문자 경로), `src/common/http/banned-access.test.ts`, `src/auth/providers/oauth-identity.provider.test.ts`(`fetch` stub), `src/config/production.config.spec.ts`(앱 로그인 콜백 포함), `src/config/app-auth-callback.test.ts`(커스텀 스킴·다른 origin 거부 회귀).
- DB를 쓰지 않는 integration: `src/common/http/api-access.middleware.integration.test.ts`(SSR 방문자 버킷·위조 헤더), `src/common/http/configure-http.integration.test.ts`(대소문자 경로 404).
- integration: `src/auth/auth.controller.integration.test.ts`(Bearer 발급·폐기, 잘못된 Bearer 401, 테스트 인증 꺼짐 404, 세 제공자 subject 분리, state-provider 결합), `src/auth/app-auth.service.integration.test.ts`(PKCE 1회 교환·동시 교환·만료·잘못된 challenge), `src/auth/banned-identity.integration.test.ts`(밴 회피, 앱 시도는 https 콜백 `?error=login_failed`), `src/app.integration.test.ts`(`rejects CSRF and anonymous mutations`, 온보딩 동의), `src/support/support.controller.integration.test.ts`(밴·해제가 기존 세션에 적용되고 문의는 유지), `src/admin/auth/admin-auth.integration.spec.ts`(전용 계정·쿠키 격리·문의·인증·비밀번호 변경).

## 명령 (side 루트)

```sh
yarn workspace @game-feedback/api test:unit
yarn workspace @game-feedback/api test:integration src/auth src/app.integration.test.ts src/support
yarn workspace @game-feedback/api typecheck
```
