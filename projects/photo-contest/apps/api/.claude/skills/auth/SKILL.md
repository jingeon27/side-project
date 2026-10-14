---
name: auth
description: API의 세션 쿠키 파싱·발급·삭제와 @Viewer() 조회자 해석, Origin 검사, 개발 로그인, OAuth provider 추가·변경, 앱 로그인 핸드오프(app_challenge·AppLoginTicket·/auth/app/exchange)를 고치거나 검토할 때 사용한다.
---

정해진 결정은 `contest-api` 스킬의 '인증'. 여기서는 코드 위치와 바꿀 때 지킬 불변식만 다룬다.

## 요청 한 건의 경로

1. `src/bootstrap.ts` `createApp()`: `noStore` → `originGuard` → `/uploads` raw → `json` → `bodyParserErrorHandler` → 라우트(파이프에서 세션 조회). 본문·세션을 읽는 새 미들웨어는 `originGuard` 뒤에 둔다 — 그래야 다른 Origin은 비로그인이어도 401보다 403이 먼저다.
2. `src/common/http/origin-guard.middleware.ts`: GET·HEAD·OPTIONS 밖은 `req.headers.origin === webOrigin()`일 때만 통과한다(403 `ERROR_MESSAGE.FORBIDDEN_ORIGIN`). 경로별 예외를 두지 않고, 상태를 바꾸는 엔드포인트를 GET으로 만들지 않는다(OAuth 시작·콜백은 브라우저 이동이라 GET이고 state 쿠키 + PKCE가 지킨다). GraphQL은 여기에 Apollo `csrfPrevention`이 더해진다.
3. `src/common/http/cookie-header.ts`의 `readCookie(header, name)`만 쿠키를 읽는다. cookie-parser가 없어 `req.cookies`는 undefined다. `Authorization` 헤더를 읽는 코드를 더하지 않는다.
4. `src/auth/session.service.ts`: 값이 43자 base64url이 아니면 DB를 보지 않는다. `viewer(req)`는 `WeakMap<Request, Promise>`로 요청당 한 번 조회하고 만료 세션은 오류 없이 null, `requireViewer(req)`는 UNAUTHENTICATED. 세션은 `start(res, userId)`·`end(req, res)`로만 만들고 지운다 — DB에는 `sha256Hex(token)`만, 쿠키는 `authCookieOptions()`(지울 때도 같은 옵션이어야 브라우저가 지운다).
5. `src/auth/viewer.decorator.ts`: `@Viewer()`·`@OptionalViewer()`가 `requestOf(context)`로 Express `req`를 꺼내고 파이프가 `SessionService`를 부른다(GraphQL context도 `createGraphqlContext`가 같은 `req`를 넘긴다). `AuthModule`이 `@Global`이므로 다른 모듈은 데코레이터만 쓰고 쿠키·`SessionService`를 직접 읽지 않는다.

## 개발 로그인

- `developmentLoginEnabled()`(`src/config/env.ts`)는 `NODE_ENV === 'development' && ENABLE_DEV_LOGIN === 'true'`일 때만 연다. 조건을 넓히지 않는다(NODE_ENV 없음·`test`·`'1'`은 닫힘). 닫히면 `POST /auth/dev` 403, `GET /auth/config`의 `developmentLogin` false.
- 사용자는 `provider: 'dev'`, `providerId: 닉네임`으로 upsert된다 — 같은 닉네임이면 같은 사용자다.

## OAuth provider 추가

1. `src/config/env.ts`의 `TOAuthProviderName`에 이름을 더한다(`oauthCredentials()`가 `<NAME>_CLIENT_ID`·`<NAME>_CLIENT_SECRET`을 읽는다). 키는 `../../.env.example`에 더한다.
2. `src/auth/oauth-provider.ts`: `OAUTH_PROVIDER`, `ENDPOINTS`(빠지면 타입 오류), 프로필 zod 스키마, `identityOf` 분기(ts-pattern `match(provider)…exhaustive()`), `isOAuthProviderName`(손으로 쓴 비교라 타입이 잡지 못한다). `providerId`는 provider의 고정 사용자 ID다 — 이메일로 찾거나 계정을 합치지 않는다. scope는 프로필에 필요한 만큼만.
3. `src/auth/auth.service.ts`의 `IAuthConfig`·`config()`에 키를 더한다(웹이 로그인 버튼 표시에 쓴다).
4. provider 콘솔의 redirect URI는 `${WEB_ORIGIN}/backend/auth/<name>/callback`이다(같은 origin이라야 state 쿠키가 돌아온다).
5. 웹 `../web/src/shared/constants/routes.ts`의 `AUTH_PROVIDER` 타입과 앱 소셜 로그인 provider enum(`../../packages/bridge/src/protocol.ts`)은 `frontend`·`bridge` 스킬대로 바꾼다.

## 앱 핸드오프 불변식 (`src/auth/auth.service.ts`)

- `startOAuth`: `app_challenge`는 정확히 43자 `[A-Za-z0-9_-]`, 아니면 400. `OAuthAttempt.appChallenge`에 저장한다.
- `completeOAuth`는 던지지 않고 항상 이동할 URL을 돌려준다(`@Redirect()` 302). 앱 시도면 세션 쿠키를 만들지 않는다(시스템 브라우저의 쿠키는 WebView에 닿지 않는다). `issueAppTicket`은 코드 원문을 `${mobileAppScheme()}://auth/callback?code=`에만 싣고, `AppLoginTicket`에는 코드 대신 `sha256Hex(code)`를 `APP_LOGIN_TICKET_TTL_MS` 만료로 저장한다. 실패는 앱 시도면 앱 scheme `?error=login_failed`, 아니면 `${WEB_ORIGIN}/?loginError=1`.
- `exchangeAppLogin`: 형식·만료·불일치·재사용 모두 같은 403 `ERROR_MESSAGE.APP_LOGIN_REJECTED` — 어느 단계에서 틀렸는지 드러내지 않는다. 비교는 `safeEqual(pkceChallenge(verifier), ticket.challenge)`, 소비는 비교가 끝난 뒤 `deleteMany({ where: { codeHash, expiresAt: { gt: now } } })`의 `count === 1`로 한다 — 틀린 verifier는 티켓을 쓰지 않고, 동시 교환은 한 건만 세션을 받는다. 세션은 WebView 안에서 부르는 이 POST의 응답 쿠키로만 준다.
- `mobileAppScheme()`의 웹 scheme 거부(`RESERVED_SCHEMES`)를 없애지 않는다(코드가 웹으로 샌다). 코드·verifier·세션 토큰을 로그·Sentry·이벤트에 넣지 않는다.

## 건드리면 있어야 하는 테스트

- unit: `src/common/http/cookie-header.spec.ts`(섞인 쿠키, 같은 이름 중복, 따옴표·퍼센트, 4KB 초과, 깨진 형식), `src/common/crypto.spec.ts`(RFC 7636 벡터), `src/config/env.spec.ts`(개발 로그인 조건, 앱 scheme).
- api 레인(`api-test` 스킬): 모든 변경 엔드포인트의 Origin 없음·다른 Origin 403(비로그인이어도), 세션 쿠키 HttpOnly·SameSite=Lax·Path=/, DB에 토큰 원문 없음, 깨진 Cookie 헤더는 비로그인, 로그아웃 뒤 같은 쿠키 거부, 앱을 만든 뒤 `vi.stubEnv('NODE_ENV', 'production')`이면 개발 로그인 403.
- OAuth(provider fetch stub): `/auth/unknown` 400, client id 없음 503, state 불일치·만료·재사용은 `/?loginError=1`로 302, token 요청의 `code_verifier`가 authorize의 `code_challenge`와 맞음, 같은 provider ID로 다시 로그인하면 같은 사용자. 앱 핸드오프: 잘못된 challenge 400, 콜백은 세션 쿠키 없이 앱 scheme으로, 교환 성공·재사용 403·틀린 verifier 뒤 올바른 verifier 성공·만료 403·동시 교환 정확히 1건.
