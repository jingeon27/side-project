# session

실행·계정 생성 절차는 `README.md`을 따른다. 사용자의 별도 관리자 계정 요청에 따라 기존 테스트 로그인/운영 Bearer 모드를 제거했다.

- 브라우저는 같은 Origin의 `/api/admin/*`를 SDK로 호출하고 `credentials: include`를 쓴다. 관리자 세션은 AdminAccount/AdminSession이고 공개 Session과 분리한다.
- 로그인은 `/api/admin/auth/login`에 ID·8–128자 비밀번호를 보내며, 계정 생성/비밀번호 초기화는 신뢰된 `operator.ts create|reset-password` CLI에서 stdin으로만 받는다. 일반 사용자를 승격하거나 HTTP 가입 API를 만들지 않는다.
- 전용 `gamefeedback_admin_session` 쿠키는 HttpOnly·SameSite=Strict·Path=/api/admin·1시간이다. loopback HTTP 프록시/SSH 터널에서만 쓰므로 Secure는 붙이지 않는다. 공개 API는 관리자 쿠키로 인증하지 않는다.
- Vite 기본 target은 `http://127.0.0.1:14300`, API Origin은 `https://game.bambyul.com`이다. 격리된 로컬 API는 두 Origin을 명시해서 선택한다. 로그인 화면/인증 로직을 환경별로 나누지 않는다.
- 기존 `localAdminGuard`는 dev/preview에서 실제 브라우저 Origin과 포트를 검사한다. API 프록시가 Origin을 바꾸므로 이 가드를 유지한다. loopback HTTP target만 허용하며 strictPort·allowedHosts·frame-ancestors none·X-Frame-Options DENY를 유지한다.
- `GF_ADMIN_ACCESS_TOKEN`, `VITE_GF_ADMIN_OPERATOR`, 테스트 관리자 로그인 버튼을 다시 도입하지 않는다. 비밀번호·토큰·쿠키를 env·storage·로그·번들에 남기지 않는다.
- 로그인/로그아웃 성공 시 `replaceSession`은 cancelQueries → 세션 외 removeQueries → mutation cache clear → 세션 setQueryData 순서로 계정 데이터를 정리한다. 실패하면 기존 캐시를 유지한다.
- `src/_app/providers/query-client.ts`의 QueryCache와 MutationCache onError는 `AUTH_REQUIRED`(401)일 때만 sessionOptions를 invalidate한다. 로그인 실패 `INVALID_ADMIN_CREDENTIALS`는 제외한다. 401 판정 `isAuthRequired`는 `features/auth/api`가 소유한다. 쿼리 기본 gcTime은 Infinity다. 만료로 숨긴 화면의 데이터가 지워지면 다시 그릴 때 만료된 쿠키로 조회하기 때문이다. 캐시는 `replaceSession`이 로그인과 로그아웃 때마다 지운다.
- 세션은 연장하지 않는다. 조회·변경이 `AUTH_REQUIRED`(401)로 끝나면 `src/_app/providers/query-client.ts`가 세션을 다시 받고, 관리자였던 세션이 사라졌으면 `sessionOptions`가 `AdminSessionExpiredError`를 낸다. `AdminRouter`는 작업 화면을 내리지 않고 `Activity` hidden으로 숨겨 초안을 남기고 주기 조회를 멈춘다. 다시 로그인하면 같은 화면으로 돌아오고, 직접 로그아웃하거나 새로고침하면 화면 상태가 사라진다.
- 문의 메시지는 공개 채팅 API 대신 `/api/admin/support/:conversationId/messages`를 쓴다. API는 담당 관리자와 실제 문의인지 확인한다.
- `vite.config.spec.ts`, auth mutation-options 단위 테스트, `e2e/admin.spec.ts`를 수정 범위에 맞게 실행한다. Admin E2E는 3304/4304·55444의 새 `gf_test_admin_*` 스키마에만 계정 fixture를 생성하고 자기 스키마만 정리한다.
