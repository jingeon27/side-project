---
name: game-feedback-admin-session
description: Admin(apps/admin)의 Vite 프록시·Origin 가드, 로컬 테스트 관리자 로그인, SSH 터널과 `GF_ADMIN_ACCESS_TOKEN` 운영 모드, 로그인·로그아웃 계정 전환, 3303 로컬 실행을 고치거나 실행할 때 사용한다.
---

실행·운영 절차의 원문은 `README.md`·`.env.example`과 `../../../../deploy/shared-instance/README.md`의 "운영·롤백"이고, 계정 전환 원칙은 `game-feedback-code-style` 스킬에 있다. 여기서는 코드 위치와 바꿀 때 지킬 불변식만 다룬다.

## 연결 구조 (`vite.config.ts`)

1. 브라우저는 같은 Origin의 `/api`만 부른다. SDK `apiFetch`는 상대 경로와 `credentials: 'include'`를 쓰고, Admin 코드에는 API 주소·토큰이 없다.
2. `localAdmin(port)` 미들웨어가 프록시보다 먼저 돈다. `/api`의 GET·HEAD·OPTIONS 외 요청은 Origin이 `http://localhost:<port>`·`http://127.0.0.1:<port>`가 아니면 403 `INVALID_ORIGIN`이다. dev(`configureServer`)와 preview(`configurePreviewServer`) 모두 건다.
3. `/api` 프록시는 `Origin`을 `GF_ADMIN_WEB_ORIGIN`(기본 `http://localhost:3300`)으로 바꿔 API `assertOrigin`(`../api/src/common/http/origin.ts`)을 통과시키고, 운영 모드면 `Authorization: Bearer <token>`을 붙인다. API는 브라우저의 실제 Origin을 보지 못하므로 그 검사는 2번 가드가 맡는다. 가드를 없애거나 허용 Origin을 넓히지 않는다.
4. 시작할 때 다음을 검증하고 어긋나면 throw한다.
   - `GF_ADMIN_API_ORIGIN`(기본 `http://localhost:4300`)은 `localhost`·`127.0.0.1`의 `http:` origin만 허용하고 경로·계정 정보를 거부한다. 운영 API도 SSH 터널의 로컬 포트로만 연결한다.
   - `GF_ADMIN_ACCESS_TOKEN`은 `^[A-Za-z0-9_-]{43}$`이어야 하고, 값이 있으면 `GF_ADMIN_WEB_ORIGIN`은 `https://`로 시작해야 한다.
5. dev·preview 모두 `host: '127.0.0.1'`, `strictPort: true`, `allowedHosts: ['localhost', '127.0.0.1']`이다. 포트는 `GF_ADMIN_PORT`(기본 3303)이며 공인 IP 바인딩이나 host 허용 확장을 하지 않는다.
6. dev·preview 응답은 `X-Frame-Options: DENY`·CSP `frame-ancestors 'none'`·`nosniff`·`Referrer-Policy: no-referrer`를 보낸다. 운영 모드에서는 모든 요청에 토큰이 붙으므로 다른 사이트가 이 화면을 frame으로 띄워 클릭을 유도하지 못하게 하는 장치다.

## 토큰 경계

- `loadEnv(mode, process.cwd(), '')`로 읽은 토큰은 프록시 헤더에만 쓴다. 브라우저에는 `define`의 `import.meta.env.VITE_GF_ADMIN_OPERATOR`(`'true'`·`'false'`)만 넘기고, 앱은 `src/shared/config/index.ts`의 `operatorMode`로만 읽는다.
- Vite는 `VITE_*` 변수를 클라이언트 `import.meta.env`로 노출한다. 운영 값에 `VITE_` 접두사를 붙이지 않고, 토큰을 `define`·응답 본문·storage·로그에 싣지 않는다.
- API는 `Authorization` 헤더가 있으면 쿠키를 보지 않는다(`../api/src/auth/session-token.ts`). 운영 모드의 모든 요청은 브라우저 쿠키와 상관없이 토큰 계정으로 처리된다.

## 로그인 모드

- 로컬(`operatorMode` false): `LoginPage`의 "로컬 관리자 로그인" → `loginLocalAdmin`(`src/features/auth/api/auth.api.ts`) → `issueTestToken({ accountId: 'sample-test-admin' })` → `getSession()`. 응답의 accessToken은 버리고 API가 설정한 HttpOnly 쿠키만 쓴다. API 테스트 인증(`GF_TEST_AUTH_ENABLED=true` 또는 데모 모드)이 꺼졌거나 production이면 `TestAuthGuard`가 404를 낸다(`../api/src/config/app.config.ts`).
- 운영(`operatorMode` true): `LoginPage`가 버튼을 렌더링하지 않고 `loginLocalAdmin`도 먼저 throw한다. 둘 다 유지한다. 운영 API의 테스트 인증을 켜는 방식으로 우회하지 않는다.
- 운영 세션은 서버에서 SSH로 실행하는 `bash /srv/side-project/services/game-feedback/current/host/service.sh game-feedback operator session <user-id>`(`../../../../deploy/shared-instance/scripts/service.sh` → `../api/scripts/operator.mjs` → `../api/src/admin/operator-session.ts`의 `issueOperatorSession`)로만 발급된다. 대상은 테스트·밴 계정이 아닌 ADMIN이며, 세션은 1시간이고 `ISSUE_OPERATOR_SESSION` 감사 기록이 남는다. HTTP로 운영 세션을 발급하거나 권한을 올리는 경로를 만들지 않는다.
- 운영 모드에서 "로그아웃"을 누르면 `POST /api/auth/logout`이 그 Bearer 세션을 서버에서 지운다. 이후에는 `LoginPage`의 만료 안내가 보이며, Vite를 멈추고 새 세션으로 다시 시작해야 한다.

## 계정 전환 (`src/features/auth/model/auth.mutation-options.ts`)

- `replaceSession(client, session)`의 순서는 `cancelQueries()` → 세션 쿼리(`['admin-session']`)를 뺀 모든 쿼리 `removeQueries` → `getMutationCache().clear()` → `setQueryData`로 새 세션이다. 세션 쿼리를 남기는 이유는 `AdminRouter`의 observer를 붙여 두기 위해서다.
- 로그인·로그아웃 모두 `onSuccess`에서만 호출한다. 실패하면 현재 세션과 캐시를 보존한다.
- 순서나 삭제 범위를 바꾸면 `src/features/auth/model/auth.mutation-options.spec.ts`의 세 사례를 함께 고친다: 이전 요청 abort와 캐시 제거, 로그아웃 뒤 익명 세션만 남김, 실패 시 보존.

## 로컬 실행 (side 루트)

1. `corepack yarn workspace @side/game-feedback dev:test`를 실행한다. `../../scripts/dev.mjs`가 3300·4300이 비었는지 확인하고, DB 시작·sync·seed 뒤 `GF_TEST_AUTH_ENABLED=true`로 API·Web을 띄운다.
2. 별도 터미널에서 `corepack yarn workspace @side/game-feedback admin:dev`를 실행하고 http://127.0.0.1:3303 에서 "로컬 관리자 로그인"을 누른다.
3. 다른 API에 붙일 때는 `GF_ADMIN_API_ORIGIN`·`GF_ADMIN_WEB_ORIGIN`·`GF_ADMIN_PORT`를 쓴다. 쓰기 요청이 통과하려면 `GF_ADMIN_WEB_ORIGIN`이 그 API의 `WEB_ORIGIN`과 같아야 한다.

- 운영 연결은 `../../../../deploy/shared-instance/README.md`와 `.env.example`의 안내처럼 셸 환경변수로 한 번만 넘긴다. 이 앱의 `.env.local`에 두면 Git에서는 제외되지만, 이후 E2E를 포함한 모든 `dev`가 그 값을 읽는다. E2E는 http Origin이므로 `Operator mode requires an HTTPS GF_ADMIN_WEB_ORIGIN.`으로 시작에 실패한다. 실수로 파일에 넣었다면 운영 작업이 끝난 뒤 토큰을 지운다.

## 확인 (side 루트)

- 쓰기 가드와 권한 분기는 `e2e/admin.spec.ts`의 첫 테스트가 검증한다. 다른 Origin의 `POST /api/auth/test-token`은 403, 일반 계정의 `GET /api/admin/support`는 403이고 관리자 메뉴가 없어야 한다.
- `vite.config.spec.ts`가 Origin 가드(허용 Origin·다른 사이트·다른 포트·Origin 없음·읽기 요청), 로컬/운영 모드의 프록시 헤더, 시작 검증, `define`에 토큰이 없는지를 단위 테스트한다. 실제 운영 API 연결은 자동 테스트가 없다. 프록시나 `define`을 바꿨다면 43자 더미 토큰으로 build한 뒤 `dist/`에 그 값이 없는지도 확인한다.

```sh
corepack yarn workspace @game-feedback/admin test
corepack yarn workspace @game-feedback/admin test:e2e -g "foreign origins"
GF_ADMIN_ACCESS_TOKEN=operatortokencheck_0123456789abcdefghijklmn GF_ADMIN_WEB_ORIGIN=https://example.invalid \
  corepack yarn workspace @game-feedback/admin build
grep -r operatortokencheck projects/game-feedback/apps/admin/dist   # 출력이 없어야 한다
```
