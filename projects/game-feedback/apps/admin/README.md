# Game Feedback Admin

공개 Web/WebView와 분리된 React + Vite 로컬 관리자 서비스다. `apps/admin`이 화면, FSD 도메인, Vitest/Playwright를 소유하며 REST API와 공통 디자인 시스템을 재사용한다. 공개 Web의 `/ko/admin`, `/en/admin`, `/ja/admin`은 404다.

코드 변경에는 [코드스타일 스킬](../../.agents/skills/game-feedback-code-style/SKILL.md)과 [Admin 작업 규칙](AGENTS.md)을 적용한다. `_app`은 Provider·인증·라우트 조합, `_pages`는 로그인·문의·신고·사용자 관리 화면, `widgets`는 셸·대화·사용자 패널을 소유한다. `features`의 REST IO·조회 options·mutation options를 정의하고 호출부에서 useMutation으로 직접 조립한다. 폼은 각 목적의 Zod 스키마로 관리한다. 같은 경계는 앱 ESLint에서도 검사한다.

## 실행

저장소 루트에서 Node 24와 Yarn 4를 사용한다.

```sh
corepack yarn workspace @side/game-feedback dev:test
# 별도 터미널
corepack yarn workspace @side/game-feedback admin:dev
```

http://127.0.0.1:3303 에서 로컬 관리자 로그인을 누른다. 이 버튼은 기존 `POST /api/auth/test-token`으로 관리자 테스트 계정을 발급한다. API는 `GF_TEST_AUTH_ENABLED=true`와 준비된 테스트 계정이 필요하다. 일반 사용자의 세션은 API에서 403으로 거부한다. HttpOnly 세션 쿠키를 사용하며 access token을 저장하지 않는다.

문의함에서 문의 채팅 답변/처리 완료/재개, 신고함에서 검토/반려/콘텐츠 숨김, 사용자 관리에서 ID 조회/프로필 인증 승인·해제/사유를 입력한 밴·해제를 제공한다. 문의 메시지는 5초 주기로 갱신하며 실패한 답변 초안과 재전송 ID를 유지한다. 감사 기록과 권한은 API가 관리한다.

서버는 `127.0.0.1`에만 바인딩한다. 기본 프록시는 API `localhost:4300`, 서비스 Origin `localhost:3300`이다. 다른 로컬 실행 조합은 `GF_ADMIN_API_ORIGIN`, `GF_ADMIN_WEB_ORIGIN`, `GF_ADMIN_PORT`로 지정한다. 프록시는 실제 로컬 관리자 Origin을 확인한 뒤 API의 설정된 서비스 Origin으로 전달한다.

운영 API에는 SSH 터널과 SSH에서 발급한 실제 ADMIN 계정의 한 시간짜리 세션으로 연결한다. `GF_ADMIN_ACCESS_TOKEN`은 로컬 Vite 서버만 사용하고 브라우저에 전달하지 않는다. 이 모드에서는 테스트 로그인 버튼이 숨겨진다. `.env.example`과 [운영 Admin 절차](../../../../deploy/shared-instance/README.md)를 따른다. Admin 자체는 공개 배포하지 않으며 운영 테스트 인증은 켜지 않는다.

## 검증

```sh
corepack yarn workspace @game-feedback/admin typecheck
corepack yarn workspace @game-feedback/admin lint
corepack yarn workspace @game-feedback/admin test
corepack yarn workspace @side/game-feedback db:test:start
corepack yarn workspace @game-feedback/admin test:e2e
corepack yarn workspace @game-feedback/admin build
```

Playwright는 개발 서버와 별개인 Admin 3304/API 4304와 테스트 DB 55444의 고유 `gf_test_admin_*` 스키마를 생성하고 해당 스키마만 정리한다.
