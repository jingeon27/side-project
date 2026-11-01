---
name: game-feedback-admin
description: Game Mate 로컬 관리자 Vite 앱의 화면·hash 경로·별도 세션·SSH 프록시·unit/브라우저 테스트를 변경할 때 사용한다. 공개 Next 웹에 관리자 세션을 재사용하지 않는다.
---

# Game Mate 관리자

앱 AGENTS.md와 [클라이언트 조합](../game-feedback-client/SKILL.md)을 따른다. 경로는 `apps/admin` 기준이며 Next 전용 모듈을 가져오지 않는다.

- FSD 화면·hash 경로·관리자 REST와 SDK: [화면](references/screen.md).
- AdminAccount·HttpOnly 세션·loopback 프록시·SSH 터널: [세션](references/session.md).
- Vitest·Playwright·격리 API/스키마·DB 없는 브라우저 검사: [테스트](references/test.md).

운영 계정 생성·비밀번호 변경은 신뢰된 CLI 절차를 따르고 일반 화면 작업에 섞지 않는다. 다른 개발 서버·터널·DB 프로세스를 종료하지 않는다.
