---
name: auth
description: API의 세션 쿠키 파싱·발급·삭제와 @Viewer() 조회자 해석, Origin 검사, 익명 세션, 아이디·비밀번호 가입·로그인, 로그아웃을 고치거나 검토할 때 사용한다.
---

정해진 결정은 `contest-api` 스킬의 '인증'. 여기서는 코드 위치와 바꿀 때 지킬 불변식만 다룬다. API에는 소셜(OAuth) 로그인·앱 로그인 교환·개발 로그인 엔드포인트가 없다. 다시 들일 때는 이 스킬과 `contest-api`를 먼저 고친다.

## 요청 한 건의 경로

1. `src/bootstrap.ts` `createApp()`: `noStore` → `originGuard` → 운영 GraphQL·고정 미디어 경로의 주소별 요청 제한 → `json`(GraphQL 메타데이터만, 파일은 브라우저가 저장소로 직접 보낸다) → `bodyParserErrorHandler` → 라우트(파이프에서 세션 조회). GraphQL multipart와 `/uploads` raw는 등록하지 않는다. 본문·세션을 읽는 새 미들웨어는 `originGuard` 뒤에 둔다 — 그래야 다른 Origin은 비로그인이어도 401보다 403이 먼저다.
2. `src/common/http/origin-guard.middleware.ts`: GET·HEAD·OPTIONS 밖은 `req.headers.origin === webOrigin()`일 때만 통과한다(403 `ERROR_MESSAGE.FORBIDDEN_ORIGIN`). 경로별 예외를 두지 않고, 상태를 바꾸는 엔드포인트를 GET으로 만들지 않는다. GraphQL은 여기에 Apollo `csrfPrevention`이 더해진다.
3. `src/common/http/cookie-header.ts`의 `readCookie(header, name)`만 쿠키를 읽는다. cookie-parser가 없어 `req.cookies`는 undefined다. `Authorization` 헤더를 읽는 코드를 더하지 않는다.
4. `src/auth/session/session.service.ts`: 값이 43자 base64url이 아니면 DB를 보지 않는다. `viewer(req)`는 `WeakMap<Request, Promise>`로 요청당 한 번 조회하고 만료 세션은 오류 없이 null, `requireViewer(req)`는 UNAUTHENTICATED. 세션은 `start(res, userId)`·`end(req, res)`로만 만들고 지운다 — DB에는 `sha256Hex(token)`만, 쿠키는 `authCookieOptions()`(지울 때도 같은 옵션이어야 브라우저가 지운다).
5. `src/auth/session/viewer.decorator.ts`: `@Viewer()`·`@OptionalViewer()`가 `requestOf(context)`로 Express `req`를 꺼내고 파이프가 `SessionService`를 부른다(GraphQL context도 `createGraphqlContext`가 같은 `req`를 넘긴다). `AuthModule`이 `@Global`이므로 다른 모듈은 데코레이터만 쓰고 쿠키·`SessionService`를 직접 읽지 않는다.

## 익명 세션

- `startAnonymousSession` mutation(`AnonymousAuthService.start`): 이미 세션이 있으면 그 사용자를 그대로 돌려주고, 없을 때만 `provider: 'anonymous'` 사용자와 세션을 만든다. 만들 때마다 가입과 같은 IP 버킷(`AUTH_REGISTER_IP_LIMIT`, 15분)을 센다.
- 조회자의 `provider === 'anonymous'`가 익명 여부다(`User.isAnonymous`). 익명 계정은 공개 그룹만 즉시 가입하고, 비공개 그룹 생성·가입 신청은 로그인(회원 가입)을 안내한다. 그룹 대회·기존 대회 투표는 할 수 없다(`auth/anonymous/anonymous.ts`의 `isAnonymous`). 업로드는 익명 계정용 저장 용량 한도(500MB)를 쓰고, 운영에서는 주소별 하루 업로드 용량도 센다(`media-upload/storage-quota.ts`, `RateLimitService.consumeUploadBytes`).
- 익명 상태에서 `registerWithPassword`로 가입하면 같은 사용자 행을 회원으로 바꿔 가입한 그룹·작성한 콘텐츠를 이어 간다.

## 아이디·비밀번호 로그인

- `PasswordAuthService`의 `registerWithPassword`·`loginWithPassword` GraphQL mutation이 기존 `SessionService`로 같은 쿠키를 발급한다. 성공 시 요청의 이전 세션을 폐기한다.
- 아이디는 trim·소문자 처리한 영문/숫자/밑줄 3~24자, 닉네임 1~24자다. 가입 비밀번호는 8~128자로 앞뒤 공백·유니코드를 바꾸지 않는다.
- User와 1:1인 PasswordCredential에 아이디·scrypt-v1 해시를 둔다. salt 16바이트, N=32768·r=8·p=3·64바이트 결과이며 timingSafeEqual로 비교한다. 없는 아이디도 같은 scrypt 비용을 쓴다. 비밀번호·해시는 GraphQL·이벤트·로그·Sentry에 싣지 않는다.
- AuthAttempt는 15분 버킷의 IP/아이디를 SHA-256 키로만 저장하고 DB upsert 증가로 여러 API 인스턴스에도 제한한다. 가입·익명 시작 IP 5회, 로그인 IP 30회(시도마다)·아이디 10회(실패만 센다, 차면 검증 전에 거절)이며 만료 행은 maintenance가 지운다. IP는 Express가 확인한 요청 주소를 `clientAddressKey()`로 묶어 쓰고(IPv6는 /64) 클라이언트의 전달 헤더를 직접 신뢰하지 않는다.
- scrypt는 프로세스당 동시 2개까지만 실행하고 16개를 넘게 기다리면 바로 RATE_LIMITED로 거절한다(`createScryptGate`).
- 계정을 이메일 등 다른 식별자로 합치지 않는다. 검증은 `src/auth/password/password-auth.service.integration.spec.ts`와 `src/auth/password/password.spec.ts`를 함께 확인한다.

## 로그아웃

- `POST /auth/logout`(Origin 검사 대상, 200 `{ ok: true }`)이 세션 행을 지우고 같은 쿠키 옵션으로 쿠키를 지운다. 세션이 없어도 200이다.

## 테스트용 로그인

- 통합 테스트 하네스(`test/support/app.ts`)의 `login(nickname)`은 HTTP 로그인 없이 격리 DB에 `provider: 'testing'` 사용자와 세션 해시를 만들고 Cookie 헤더 값을 돌려준다. 웹·모바일 격리 API는 NODE_ENV=test·ENABLE_TEST_API=true에서만 열리는 `POST /testing/users`로 사용자·세션을 만든다. 운영 제품 API에 테스트 로그인 분기를 넣지 않는다.

## 건드리면 있어야 하는 테스트

- unit: `src/common/http/cookie-header.spec.ts`(섞인 쿠키, 같은 이름 중복, 따옴표·퍼센트, 8KB 초과, 깨진 형식), `src/auth/session/auth-cookie.spec.ts`(운영 `__Host-` 이름), `src/common/crypto.spec.ts`(토큰·해시), `src/auth/password/auth.dto.spec.ts`·`src/auth/password/password.spec.ts`(입력·해시).
- integration 레인(`api-test` 스킬): 모든 변경 엔드포인트의 Origin 없음·다른 Origin 403(비로그인이어도, `src/bootstrap.integration.spec.ts`), 세션 쿠키 HttpOnly·SameSite=Lax·Path=/, DB에 토큰 원문 없음, 깨진 Cookie 헤더는 비로그인, 로그아웃 뒤 같은 쿠키 거부(`src/auth/session/session.service.integration.spec.ts`), 운영 쿠키 이름(`src/auth/session/auth-cookie.integration.spec.ts`), 익명 세션 재사용·권한 제한(`src/auth/anonymous/anonymous-auth.service.integration.spec.ts`), 가입·로그인 반복 시도 제한(`src/auth/password/password-auth.service.integration.*`).
