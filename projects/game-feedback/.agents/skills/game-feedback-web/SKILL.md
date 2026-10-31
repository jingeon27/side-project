---
name: game-feedback-web
description: Game Mate Next 웹의 화면·SEO·탐색·REST 캐시·Quill/미디어·Playwright를 변경할 때 사용한다. 관리자 Vite 화면과 Expo 셸은 각 전용 스킬을 쓴다.
---

# Game Mate 웹

앱 AGENTS.md와 [클라이언트 조합](../game-feedback-client/SKILL.md)을 따른다. 경로는 `apps/web` 기준이다. 필요한 주제만 읽는다.

| 작업 | 참조 |
| --- | --- |
| FSD 화면·Topbar·서버 첫 데이터·SEO·오류 경계 | [페이지](references/page-structure.md) |
| 게시판 문맥·locale·뒤로 가기·URL·WebView 이동 | [탐색](references/navigation.md) |
| query/mutation options·계정 전환·SSE·캐시 | [서버 상태](references/server-state.md) |
| RHF/Zod·Quill·본문/채팅 미디어 | [작성과 미디어](references/compose-media.md) |
| Playwright·격리 API/DB·로그인 fixture | [E2E](references/e2e.md) |

작성·프로필 수정·가입 설정은 FormActions로 하단 행동을 유지하고 사이트 푸터·겹치는 하단 탭을 숨긴다. 긴 폼은 페이지, 짧은 입력·선택·확인만 시트로 만든다. 실제 키보드 검증과 viewport 대역 검증을 구분한다.
