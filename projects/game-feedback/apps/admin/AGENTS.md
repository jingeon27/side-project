# Game Feedback Admin

공개 Web과 분리된 React + Vite 로컬 관리자 서비스다. 코드 변경·리뷰에는 [game-feedback-code-style](../../.agents/skills/game-feedback-code-style/SKILL.md)을 적용한다.

- `_app/AdminRouter.tsx`가 인증과 hash 경로를 조합한다. 로그인·문의·신고·사용자 관리는 각 `_pages` slice가 소유한다. 공통 셸·문의 대화·사용자 패널은 `widgets`, REST·query·mutation 정책은 각 `features`가 소유한다.
- mutation은 features의 `*.mutation-options.ts`를 public export하고 화면·기능 흐름의 호출부에서 `useMutation(xMutationOptions(client))`로 직접 조립한다. 단순히 감싸 반환하는 전용 훅은 만들지 않는다.
- ESLint의 FSD·명명·SDK 경계·query key·mutation 경계 규칙을 유지한다. 스타일 스킬을 적용한다는 이유로 lint를 끄거나 캐스팅으로 오류를 숨기지 않는다.
- 관리자는 별도 AdminAccount의 ID·비밀번호로 로그인한다. 기본 API는 운영 SSH 터널 14300이며 로컬/운영 로그인 모드를 나누지 않는다. 비밀번호·쿠키·토큰을 브라우저 storage나 로그에 남기지 않는다. 전용 HttpOnly 쿠키는 /api/admin에만 적용하며 공개 사용자 세션을 재사용하지 않는다. 계정 생성과 비밀번호 변경은 신뢰된 CLI에서만 한다.
- Admin은 loopback 3303, E2E는 3304/API 4304와 전용 테스트 DB 55444의 새 `gf_test_admin_*` 스키마를 사용한다. 다른 worktree의 개발 서버·DB 프로세스를 종료하지 않는다. 실행·운영 연결 절차는 `README.md`를 따른다.
- 타입·lint·Vitest·build는 `@game-feedback/admin`이 소유한다. 브라우저 검증은 이 앱의 Playwright 설정으로 실행하고 해당 실행에서 생성한 스키마만 정리한다.

## 앱 스킬

- `.agents/skills/game-feedback-admin-screen/SKILL.md`: hash 경로·관리자 화면/탭 추가·관리자 API와 SDK 연결.
- `.agents/skills/game-feedback-admin-session/SKILL.md`: Vite 프록시·Origin 가드·운영 토큰 경계·계정 전환·로컬 실행.
- `.agents/skills/game-feedback-admin-test/SKILL.md`: Vitest 단위·Playwright E2E·격리 스키마 정리.
