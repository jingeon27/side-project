# 블로그 문체 전체 검토 — 2026-10-29

공개한 30편의 한글과 영문 본문 60개를 모두 읽었다. 25편의 본문 44개를 교정했고, 이미 자연스러운 5편은 유지했다. 해요체 혼용과 추상적인 표현, 반복되는 결론을 주로 다듬었으며 문장 수를 일률적으로 줄이지 않았다.

코드 블록과 이미지, 대체 텍스트, 링크 대상, slug, 최초 발행일은 별도로 비교해 보존을 확인했다. 수치와 버전, 사건 순서, 보안 제약, 확인하지 못한 동작은 문체 교정을 이유로 지우지 않았다.

## 글별 검토

| 글                                                                                                                             | 한글 | 영문 | 처리                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------ | ---- | ---- | -------------------------------------------------------------------------------------- |
| [Sentry로 추적한 Bottom Sheet 드래그 크래시](../apps/web/content/posts/bottom-sheet-drag-crash/ko.mdx)                         | 수정 | 수정 | 본문을 다섯 기준으로 되풀이한 결론을 줄이고 오류 수와 헤더 수정 결과를 남겼다.         |
| [서로 다른 두 SSE를 하나의 상담 화면에 연결한 과정](../apps/web/content/posts/chatbot-message-layer/ko.mdx)                    | 수정 | 수정 | 한다체를 해요체로 맞추고 반복과 비유를 실제 송수신 경로로 풀었다.                      |
| [정산 서비스를 별도 호스트로 분리하며 토큰 전달 방식을 바꾼 과정](../apps/web/content/posts/cross-domain-token-handoff/ko.mdx) | 수정 | 수정 | 말투와 반복되는 범위 선언, 마지막 요약을 정리했다. 보안 제약과 패치 순서는 유지했다.   |
| [선언적으로 코드를 쓰는 기준](../apps/web/content/posts/declarative-code/ko.mdx)                                               | 수정 | 유지 | 조사 오타만 고쳤다. 구체적인 코드 선호와 예시는 유지했다.                              |
| [NestJS의 책임 분리를 참고해 Electron 수집 앱을 나눈 기준](../apps/web/content/posts/electron-module-boundaries/ko.mdx)        | 유지 | 유지 | 플랫폼 분리와 NestJS를 걷어낸 이유가 구체적이어서 유지했다.                            |
| [오류가 난 영역만 다시 시도하도록 Error Boundary 나누기](../apps/web/content/posts/error-boundary-recovery/ko.mdx)             | 수정 | 수정 | 편집 이력을 안내하는 도입과 비유를 줄이고 오류를 받는 위치를 직접 설명했다.            |
| [FSD 레이어를 저장소에 맞게 다시 나눈 과정](../apps/web/content/posts/fsd-layer-boundaries/ko.mdx)                             | 수정 | 수정 | 작성 기준 날짜와 세 가지 기준이라는 수사를 줄이고 실제 import와 lint 동작을 남겼다.    |
| [건강검진 예약을 기존 서비스에 연결한 과정](../apps/web/content/posts/health-check-program/ko.mdx)                             | 유지 | 유지 | 검사 선택과 결제 실패, 중복 요청 사례가 구체적이어서 유지했다.                         |
| [다음 성공에 드는 수고를 줄이기](../apps/web/content/posts/low-effort-success/ko.mdx)                                          | 수정 | 수정 | 마지막 다짐을 덜고 반복 설명과 수정이 줄었는지 돌아보는 생각으로 마쳤다.               |
| [Next.js App Router에서 prefetch를 기다려야 하는 경우](../apps/web/content/posts/nextjs-seo-prefetch/ko.mdx)                   | 유지 | 수정 | 영문에 있던 가상의 오해에 대한 반박을 초기 HTML에서 확인한 문제로 맞췄다.              |
| [Next.js의 라우팅과 캐시 문제를 추적한 기록](../apps/web/content/posts/nextjs-server-client-issues/ko.mdx)                     | 수정 | 수정 | 선언적인 반복과 마지막 체크리스트를 줄이고 남은 버전, 쿠키, 폼 문제를 문단으로 썼다.   |
| [Next.js App Router에서 서버와 브라우저의 QueryClient를 나눈 이유](../apps/web/content/posts/nextjs-tanstack-query-ssr/ko.mdx) | 수정 | 수정 | 해요체를 맞추고 조회 계약을 조회 옵션을 함께 정의한 일로 풀었다.                       |
| [결제 내역에 쿠폰 결제를 추가하며 분기를 한곳으로 모은 과정](../apps/web/content/posts/payment-coupon-branches/ko.mdx)         | 수정 | 수정 | 행을 보여주는 조건과 요청 필드 선택을 직접 설명하고 테스트가 없는 상태를 남겼다.       |
| [AI에 구현을 맡기며 다듬은 개발 workflow](../apps/web/content/posts/plan-gated-ai-workflow/ko.mdx)                             | 수정 | 수정 | 결론의 반복 목록을 덜고 상담 채팅 재검사와 API route 리뷰 예외를 정한 경험으로 마쳤다. |
| [프로토타입을 옮기며 반복되는 판단을 skills에 남긴 과정](../apps/web/content/posts/prototype-working-rules/ko.mdx)             | 수정 | 수정 | 단계의 입출력과 업무 상태를 실제로 넘기거나 유지하는 값으로 풀었다.                    |
| [Puppeteer에서 요청과 응답을 함께 기다릴 때 놓쳤던 것](../apps/web/content/posts/puppeteer-event-lifecycle/ko.mdx)             | 수정 | 수정 | 해요체를 맞추고 두 값을 모아 Promise를 끝내고 listener를 정리한 동작으로 마쳤다.       |
| [TanStack Query v4의 query key를 Query Key Factory로 정리한 이유](../apps/web/content/posts/query-key-factory/ko.mdx)          | 유지 | 유지 | 실제 key 배열과 prefix, 버전 차이와 한계를 구체적으로 설명하므로 유지했다.             |
| [저는 코드를 읽어요](../apps/web/content/posts/reading-ai-code/ko.mdx)                                                         | 수정 | 유지 | 본문의 가운데 점을 조사로 바꿨다. 코드 읽기와 테스트 실행의 구분은 유지했다.           |
| [예약 폼의 작성 상태를 Zustand에서 React Hook Form으로 옮긴 과정](../apps/web/content/posts/reservation-form-state/ko.mdx)     | 수정 | 수정 | 해요체를 맞추고 추상적인 경계 비유를 날짜 동기화 결과와 미검증 부분으로 바꿨다.        |
| [3단계 리뷰 작성 폼의 역할을 RHF, Zod, 퍼널로 다시 나눈 과정](../apps/web/content/posts/review-form-funnel/ko.mdx)             | 수정 | 수정 | 문답형 연결과 반복 결론을 줄이고 입력값, 검증, 남은 제약을 직접 설명했다.              |
| [리뷰 좋아요의 목록과 상세 캐시를 함께 갱신하기](../apps/web/content/posts/review-like-optimistic-update/ko.mdx)               | 수정 | 수정 | 서술형을 해요체로 맞추고 캐시 구독과 목록, 상세 갱신을 직접 설명했다.                  |
| [Sentry로 에러 수집부터 Web Vitals, MCP, 릴리스까지 연결한 과정](../apps/web/content/posts/sentry-observability/ko.mdx)        | 수정 | 수정 | 마지막의 다음 작업 다짐을 덜고 실제 오류 사례와 측정하지 못한 부분에서 마쳤다.         |
| [사이드 프로젝트를 만들며 바뀐 기획과 화면](../apps/web/content/posts/side-project-design/ko.mdx)                              | 유지 | 유지 | 최근 교정한 예외 사례와 화면 수정 경험이 자연스러워 본문을 유지했다.                   |
| [일단 EC2 한 대에 올려보기로 했어요](../apps/web/content/posts/side-project-infrastructure/ko.mdx)                             | 수정 | 유지 | 문장과 링크 표시에 남은 가운데 점을 풀었다. 선택 과정과 검증 범위는 유지했다.          |
| [사진 서비스는 GraphQL, 게임 서비스는 REST로 만들었어요](../apps/web/content/posts/side-project-technology/ko.mdx)             | 수정 | 유지 | 가운데 점을 조사로 풀었다. 최근 교정한 기술 선택과 구체적인 처리 설명은 유지했다.      |
| [동적 사이트맵에서 공개 API와 인증 API의 경계를 나눈 과정](../apps/web/content/posts/sitemap-api-boundaries/ko.mdx)            | 수정 | 수정 | 해요체를 맞추고 추상적인 호출 경계를 공개 API를 캐시 안에서 부르는 동작으로 풀었다.    |
| [테스트 코드를 도입하면서 세운 기준](../apps/web/content/posts/testing-standards/ko.mdx)                                       | 수정 | 수정 | 요약을 실제 테스트 경험으로 맞추고 기준을 계속 보완한다는 반복 결론을 덜었다.          |
| [두 관리자 앱에서 프로그램 폼을 공유하는 방법](../apps/web/content/posts/typed-program-form/ko.mdx)                            | 유지 | 유지 | 필드 타입과 입력 조립, 요청 변환을 실제 결정으로 설명하므로 유지했다.                  |
| [TypeScript로 호출부의 실수를 줄이는 방법](../apps/web/content/posts/typescript-patterns/ko.mdx)                               | 수정 | 유지 | 뒤에 나오는 코드를 위 예제라고 가리킨 부분을 바로잡았다.                               |
| [타입 단언을 줄이며 정리한 런타임 검증 기준](../apps/web/content/posts/zod-assertion-boundaries/ko.mdx)                        | 수정 | 수정 | 해요체를 맞추고 따로 늙는 구조 같은 비유를 확인 로직이 남는 상황으로 풀었다.           |

## 작성 지침의 적용 범위

작성 에이전트는 `projects/blog/.codex/agents/blog_writer.toml`로 옮겼다. 개인 문체 피드백은 `~/.agents/skills/blog-writing`에서 관리하고 블로그 글 작성과 교정에만 적용한다. 다른 서비스의 코드나 UI 문구 규칙으로 확대하지 않는다.

검색 설명도 함께 읽었다. 사이드 프로젝트 설계 글의 영문 구두점을 정리하고, 테스트 글과 코드 읽기 글의 설명을 실제 본문에 맞춰 다듬었다.

## 검증

- 최신 develop에 적용한 뒤 콘텐츠 검증, TypeScript, ESLint, 단위 및 컴포넌트 테스트 120개, 개발 모드 E2E 8개, 프로덕션 빌드, 데스크톱과 모바일 E2E 46개, Knip을 통과했다.
- 개인 스킬과 프로젝트 스킬 검증, 에이전트 TOML 파싱과 참조 경로 검사를 통과했다. 코드 블록, 이미지와 링크, 최초 발행일과 slug도 비교했다.

## 작업 집계 표현에 대한 추가 피드백

파일 수와 호출부 수의 집계 시점을 설명하고 장애 변화를 측정하지 않았다고 덧붙인 문장이 블로그에 어울리지 않는다는 피드백을 받았다. 관련 12편의 한글과 영문 본문에서 파일 수, 호출부 수, 줄 수를 나열한 부분을 덜고 코드의 책임과 동작이 어떻게 달라졌는지로 풀었다. 글에서 주장하지 않은 성능 개선을 끌어와 측정하지 않았다고 덧붙인 문장도 정리했다.

원인과 선택을 설명하는 실행 시간, 오류의 영향, API 제한과 설정값, 버전은 유지했다. 코드 블록, 이미지, 대체 텍스트와 링크 대상도 보존했다. 새 문체 피드백은 프로젝트 전역 지침 대신 개인 blog-writing 스킬에 기록했다.

## 본문 전면 교정

한국어와 영어 전체 글의 문단을 다시 읽고, 작업 기록과 검증 보고처럼 들리는 도입·결론을 실제 문제와 선택의 흐름으로 바꿨다. 코드 예제, 이미지와 대체 텍스트, 링크와 최초 발행일은 보존했다. 검색 설명도 각 글의 Summary와 맞췄다.

## 자율 구현과 검토 과정 보강

side-project-design의 도입을 저자가 기능과 아키텍처만 정하고 에이전트에게 세부 구현을 맡겨 본 동기로 바꿨다. 직접 실행하고 코드를 검토해 수정 방향을 정한 역할을 분명히 하고, 그룹 가입 직후 버튼 갱신과 기능 간 import, 상태 관리, 불필요한 래퍼, 카테고리 전환 뒤 오류 복구 사례를 보강했다. 목록 오류 복구는 0d900744, 콜백 정리는 c33db6a8의 구현과 검사를 확인했다. 한영 본문과 검색 요약을 함께 맞췄으며 기존 표지와 코드 예제를 유지했다.
