---
name: photo-contest-web
description: 피식 웹의 화면·라우트·Apollo·폼·오버레이·반응형 UI와 브라우저 테스트를 변경할 때 사용한다. Game Mate와 블로그에는 적용하지 않는다.
---

# 피식 웹

프로젝트·앱 AGENTS.md와 루트 공통 TypeScript·UI 규칙을 따른다. 서버 상태는 Apollo이며 React Query로 바꾸지 않는다. 경로는 별도 표시가 없으면 `apps/web` 기준이다. 필요한 주제만 읽는다.

| 작업 | 참조 |
| --- | --- |
| FSD 배치·상태·인증·앱 연동 | [구조](references/architecture.md) |
| 새 화면·서버 첫 데이터·SEO·게이트·뒤로 가기 | [페이지](references/page-structure.md) |
| GraphQL·codegen·캐시·낙관적 응답 | [Apollo](references/apollo.md) |
| RHF/Zod·제출·사진 변경·실패 초안 | [폼](references/form.md) |
| 짧은 입력/선택 시트·대화상자·history·portal | [오버레이](references/overlay.md) |
| 토큰·읽기 폭·안전 영역·반응형 | [스타일](references/styling.md) |
| Playwright·로그인 fixture·격리 서버 | [E2E](references/e2e.md) |

필드가 많거나 미디어·반복 입력이 있는 폼은 페이지로 만들고, 사이트/사이드바 푸터 없이 본문만 스크롤한다. 정보와 사진은 공통 FormActions의 하단 저장 한 번으로 제출한다. 짧은 시트의 수명 규칙을 긴 폼의 배치 지침으로 오해하지 않는다.
