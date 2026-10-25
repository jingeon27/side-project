---
name: game-feedback-admin-session
description: Admin의 ID·비밀번호 로그인, 별도 세션, loopback Vite 프록시와 SSH 터널을 수정·실행할 때 사용한다.
---

실행·계정 생성 절차는 `README.md`을 따른다. 사용자의 별도 관리자 계정 요청에 따라 기존 테스트 로그인/운영 Bearer 모드를 제거했다.

- 브라우저는 같은 Origin의 `/api/admin/*`를 SDK로 호출하고 `credentials: include`를 쓴다. 관리자 세션은 AdminAccount/AdminSession이고 공개 Session과 분리한다.
- 로그인은 `/api/admin/auth/login`에 ID·8–128자 비밀번호를 보내며, 계정 생성/비밀번호 초기화는 신뢰된 `operator.mjs create|reset-password` CLI에서 stdin으로만 받는다. 일반 사용자를 승격하거나 HTTP 가입 API를 만들지 않는다.
- 전용 `gamefeedback_admin_session` 쿠키는 HttpOnly·SameSite=Strict·Path=/api/admin·1시간이다. loopback HTTP 프록시/SSH 터널에서만 쓰므로 Secure는 붙이지 않는다. 공개 API는 관리자 쿠키로 인증하지 않는다.
- Vite 기본 target은 `http://127.0.0.1:14300`, API Origin은 `https://game.bambyul.com`이다. 격리된 로컬 API는 두 Origin을 명시해서 선택한다. 로그인 화면/인증 로직을 환경별로 나누지 않는다.
- 기존 `localAdminGuard`는 dev/preview에서 실제 브라우저 Origin과 포트를 검사한다. API 프록시가 Origin을 바꾸므로 이 가드를 유지한다. loopback HTTP target만 허용하며 strictPort·allowedHosts·frame-ancestors none·X-Frame-Options DENY를 유지한다.
- `GF_ADMIN_ACCESS_TOKEN`, `VITE_GF_ADMIN_OPERATOR`, 테스트 관리자 로그인 버튼을 다시 도입하지 않는다. 비밀번호·토큰·쿠키를 env·storage·로그·번들에 남기지 않는다.
- 로그인/로그아웃 성공 시 `replaceSession`은 cancelQueries → 세션 외 removeQueries → mutation cache clear → 세션 setQueryData 순서로 계정 데이터를 정리한다. 실패하면 기존 캐시를 유지한다.
- 문의 메시지는 공개 채팅 API 대신 `/api/admin/support/:conversationId/messages`를 쓴다. API는 담당 관리자와 실제 문의인지 확인한다.
- `vite.config.spec.ts`, auth mutation-options 단위 테스트, `e2e/admin.spec.ts`를 수정 범위에 맞게 실행한다. Admin E2E는 3304/4304·55444의 새 `gf_test_admin_*` 스키마에만 계정 fixture를 생성하고 자기 스키마만 정리한다.
