# 블로그 편집 감사 — 2026-10-28

## 범위

현재 공개한 30편의 한국어 본문을 읽고 문제를 겪은 상황, 선택한 이유, 확인한 결과가 이어지는지 살폈다. 같은 주장을 서론과 결론에서 반복하는 문장, 실제 코드보다 강한 보장, 과거 기록과 현재 구현이 섞인 설명을 우선 확인했다. 문체만으로 AI 작성 여부를 판정하지는 않았다.

한국어·영문 60개 언어판에는 콘텐츠 생성·MDX 컴파일·링크·이미지·번역 구조 검사를 적용한다. 영문은 전체 요약·도입·결론과 이번에 고친 절의 의미를 대조했다. 영문 30편의 모든 문장을 수동 교열한 것은 아니다.

공개 저장소의 새 기술 글은 연결한 구현과 설정을 확인했다. 회사 내부 사례의 장애 수, 파일 수, 줄 수는 글에 남긴 당시 기록이며 이번 감사에서 사내 저장소나 운영 환경으로 재측정하지 않았다. 축약한 코드 예제 전체를 독립 실행하거나 타입 검사한 것도 아니다.

## 고친 설명

| 글                                                              | 발견한 문제                                                                                                                  | 반영한 내용                                                                                                                                                                                                         |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 서로 다른 두 SSE를 하나의 상담 화면에 연결한 과정               | ServerStatus 타입만으로 현재 connecting 상태가 덮이지 않는다고 설명했다. 연결 정합성과 취소 처리도 예제보다 강하게 단정했다. | 서버 콜백에 connecting을 전달할 수 없는 것과 상태 전이 순서의 보장을 구분했다. 원본 코드 주석의 과장을 본문에서 짚고, 빈 큐의 await 취소·재연결·중복 메시지는 별도 확인 대상으로 남겼다. 반복한 회고 목록도 줄였다. |
| 정산 서비스를 별도 호스트로 분리하며 토큰 전달 방식을 바꾼 과정 | 3xx 중간 URL이 자동으로 다음 Referer가 된다는 설명과 오래된 수정 PR 상태가 있었다.                                           | URL 접근 로그와 Referer를 구분했다. #96834는 미병합, #97164는 실제 병합된 수정임을 구분하고 이후 빌드 산출물을 확인한 글로 연결했다. 폼 POST의 XSS·본문 수집·재전송 위험은 유지했다.                                |
| 오류가 난 영역만 다시 시도하도록 Error Boundary 나누기          | 설정 배열에는 필터별 바운더리를 둘 방법이 없다고 일반화했다.                                                                 | 당시 렌더러가 호출부에 경계 지정을 제공하지 않았다고 범위를 좁혔다. 배열 렌더러를 고치는 대안도 가능하며 JSX는 작성자가 택한 구성임을 적었다.                                                                       |
| 저는 코드를 읽어요                                              | diff 리뷰 자체를 화이트박스 테스트와 동일하게 불렀다. 두 종류의 검사 통과를 제품의 검증 완료처럼 단정했다.                   | 정적 리뷰로 경로를 찾는 일과 내부 구조를 기준으로 테스트를 작성·실행하는 일을 구분했다. 화면 확인과 자동 테스트의 역할을 남기고 버그 부재의 보장으로 확대하지 않았다.                                               |
| 예약 폼의 작성 상태를 Zustand에서 React Hook Form으로 옮긴 과정 | 서버 목록 동기화라는 설명이 같은 길이의 항목 교체까지 처리하는 것으로 읽힐 수 있었다.                                        | 길이가 같으면 memberId 교체와 이름 변경을 반영하지 않는 현재 예제의 한계를 적었다. 사내 제품 코드를 고쳤다고 주장하지 않는다.                                                                                       |
| 건강검진 예약을 기존 서비스에 연결한 과정                       | 결제 흐름 이미지의 대체 텍스트와 설명에 ‘제창’ 오타가 있었다.                                                                | ‘결제창’으로 고쳤다. 보관한 원본 이미지 바이트는 바꾸지 않았다.                                                                                                                                                     |
| 사진 서비스는 GraphQL, 게임 서비스는 REST로 만들었어요          | 공통 코드를 언제 나누는지에 대한 일반론이 실제 아키텍처 판단을 가렸다.                                                       | ESLint preset, 하나의 플러그인 등록, FSD 경로 해석, layer-imports·slice-public-api·no-cross-page와 RuleTester fixture를 실제 파일에 연결했다. 자기 평점과 추상적인 결론은 쓰지 않았다.                              |
| 프로토타입 작업 규칙·리뷰 좋아요                                | 마지막 절에서 앞 내용을 추상적인 교훈으로 다시 반복했다.                                                                     | 다음 작업에서 확인할 조건과 실제 캐시 처리 순서로 짧게 마무리했다.                                                                                                                                                  |

## 이미지와 출처

감사 시작 시 전용 표지는 8편에 있었고, 본문 이미지가 하나도 없는 글은 17편이었다. 이번에 기존 글 22편의 표지를 추가해 새 글을 포함한 30편 모두 전용 표지와 본문 이미지를 갖도록 했다. 한국어·영문은 같은 이미지를 쓰되 대체 텍스트는 각각 썼다.

추가한 그림에는 실제 제품 화면이나 정확한 시스템 구성도가 아니라는 설명을 붙였다. 기존 스크린샷과 원본 이미지 파일은 보존했다. 생성 프롬프트는 [image-prompts.json](./image-prompts.json)에 기록했다. 원래 공개 날짜와 기존 slug는 유지하고 수정 날짜만 갱신했다.

## 글별 확인 기록

아래 ‘유지’는 확인한 범위에서 본문을 더 고치지 않았다는 뜻이다. 운영 성능이나 예제의 모든 경로가 검증됐다는 뜻은 아니다. 표지 추가는 모든 대상에 별도로 적용했다.

| 글                                                                                      | 확인한 내용과 처리                                                                                                          |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [Bottom Sheet 드래그 크래시](../apps/web/content/posts/bottom-sheet-drag-crash/ko.mdx)  | Sentry 재현, 라이브러리 버전 변경, 헤더 스크롤 문제의 구분을 유지했다. #188의 열린 상태를 확인했다.                         |
| [두 SSE의 상담 화면](../apps/web/content/posts/chatbot-message-layer/ko.mdx)            | 타입·연결·취소 보장의 범위를 수정했다.                                                                                      |
| [호스트 사이 토큰 전달](../apps/web/content/posts/cross-domain-token-handoff/ko.mdx)    | 로그·Referer·실제 수정 PR을 정정했다. 임시 방식을 보편적인 인증 해법으로 소개하지 않는다.                                   |
| [선언적 코드](../apps/web/content/posts/declarative-code/ko.mdx)                        | 호출부가 숨길 세부사항과 남겨야 할 업무 조건의 구분을 확인했다. 예제와 본문은 유지했다.                                     |
| [Electron 모듈 경계](../apps/web/content/posts/electron-module-boundaries/ko.mdx)       | NestJS 구조를 Electron에 그대로 적용했다는 주장으로 확대하지 않고 main·preload·renderer 책임을 설명하는 내용을 유지했다.    |
| [Error Boundary](../apps/web/content/posts/error-boundary-recovery/ko.mdx)              | 배열 방식의 한계를 당시 렌더러로 좁혔다. 관측용 응답 검증과 차단형 검증의 구분을 확인했다.                                  |
| [FSD 레이어](../apps/web/content/posts/fsd-layer-boundaries/ko.mdx)                     | 공식 분류와 저장소에서 조정한 규칙을 구분하고 있는지 확인했다. workflow 글과의 연결을 유지했다.                             |
| [건강검진 예약](../apps/web/content/posts/health-check-program/ko.mdx)                  | 기존 예약·결제 기능과 새 기능의 관계를 확인하고 이미지 설명 오타를 고쳤다.                                                  |
| [다음 성공의 수고](../apps/web/content/posts/low-effort-success/ko.mdx)                 | 개인 작업 습관에 관한 의견을 정량적인 생산성 개선으로 읽지 않도록 맥락을 확인했다. 본문은 유지했다.                         |
| [Next.js prefetch](../apps/web/content/posts/nextjs-seo-prefetch/ko.mdx)                | SEO가 필요한 초기 본문과 탐색 중 loading의 선택 조건을 확인했다. 모든 조회를 미리 기다려야 한다는 규칙으로 확대하지 않는다. |
| [Next.js 라우팅과 캐시](../apps/web/content/posts/nextjs-server-client-issues/ko.mdx)   | 문제별 버전과 이후 16.3.6 산출물 확인 기록을 구분했다. 토큰 전달 글에서 이 기록으로 연결했다.                               |
| [서버·브라우저 QueryClient](../apps/web/content/posts/nextjs-tanstack-query-ssr/ko.mdx) | 서버 요청 간 캐시 격리와 브라우저 인스턴스 수명의 차이를 확인했다. 본문은 유지했다.                                         |
| [쿠폰 결제 분기](../apps/web/content/posts/payment-coupon-branches/ko.mdx)              | 결제 종류 분기와 화면별 표시를 구분한 사례를 확인했다. 금융·정산 전반의 보장으로 확대하지 않는다.                           |
| [AI 개발 workflow](../apps/web/content/posts/plan-gated-ai-workflow/ko.mdx)             | plan·검토·화면 확인 순서와 실제 지적 사례를 확인했다. 다른 AI 글과 공통된 원칙이 반복되지만 사례가 달라 삭제하지 않았다.    |
| [프로토타입 작업 규칙](../apps/web/content/posts/prototype-working-rules/ko.mdx)        | 조건부 규칙과 예외를 확인하고 반복적인 마지막 교훈을 줄였다.                                                                |
| [Puppeteer 이벤트 수명](../apps/web/content/posts/puppeteer-event-lifecycle/ko.mdx)     | listener 등록 순서, 완료 조건, cleanup·timeout의 역할을 확인했다. 코드 예제는 보존했다.                                     |
| [Query Key Factory](../apps/web/content/posts/query-key-factory/ko.mdx)                 | TanStack Query v4 사례라는 버전 범위를 확인했다. 현재 v5의 필수 도구라는 주장으로 바꾸지 않았다.                            |
| [저는 코드를 읽어요](../apps/web/content/posts/reading-ai-code/ko.mdx)                  | 코드 리뷰와 화이트박스 테스트의 용어를 정정했다.                                                                            |
| [예약 폼 상태](../apps/web/content/posts/reservation-form-state/ko.mdx)                 | RHF 7.56 구현 관찰과 일반 API 계약을 구분했다. 같은 길이의 서버 목록 변경을 처리하지 않는 제한을 추가했다.                  |
| [리뷰 폼 퍼널](../apps/web/content/posts/review-form-funnel/ko.mdx)                     | 폼 값·단계 이동·검증의 역할을 확인했다. 실제 작업 사례와 원본 예제는 유지했다.                                              |
| [리뷰 좋아요](../apps/web/content/posts/review-like-optimistic-update/ko.mdx)           | 목록·상세 snapshot, 수동 rollback, 재검증과 연속 조작의 제한을 확인했다. 반복적인 결론을 줄였다.                            |
| [Sentry 관측](../apps/web/content/posts/sentry-observability/ko.mdx)                    | SDK 10.70 기준의 설명과 아직 운영하지 않은 항목의 구분을 확인했다. 사내 수집 환경이나 개인정보 제거를 재인증한 것은 아니다. |
| [사이드 프로젝트 기획·화면](../apps/web/content/posts/side-project-design/ko.mdx)       | 제품 화면과 기획 변경을 중심으로 읽히는지 확인했다. 배포 판단은 별도 인프라 글에 뒀다.                                      |
| [사이드 프로젝트 인프라](../apps/web/content/posts/side-project-infrastructure/ko.mdx)  | EC2·DB 동거 비용과 장애 범위, 백업 계정, 파일 저장소의 선택을 확인했다. 운영 비용·부하·복구 실측과 설계 준비를 구분한다.    |
| [사이드 프로젝트 기술 선택](../apps/web/content/posts/side-project-technology/ko.mdx)   | GraphQL·REST, 계약 생성, DB 동시성, 테스트 레인과 ESLint 경계를 실제 저장소에 연결했다.                                     |
| [사이트맵 API 경계](../apps/web/content/posts/sitemap-api-boundaries/ko.mdx)            | 공개 조회와 인증 조회의 책임을 확인했다. 사이트맵 생성 성공을 비공개 데이터 보안 전체의 증거로 쓰지 않는다.                 |
| [테스트 도입 기준](../apps/web/content/posts/testing-standards/ko.mdx)                  | 테스트 레인과 실제 버그 재현 사례를 확인했다. 개수나 커버리지 수치를 품질 점수로 사용하지 않는다.                           |
| [공통 프로그램 폼](../apps/web/content/posts/typed-program-form/ko.mdx)                 | 공통 폼과 앱별 조립·타입의 역할을 확인했다. 적용 앱 밖의 재사용 가능성까지 단정하지 않는다.                                 |
| [TypeScript 호출부 패턴](../apps/web/content/posts/typescript-patterns/ko.mdx)          | 컴파일 시점 실수 방지와 런타임 외부 값 검증을 구분하는지 확인했다. 예제는 유지했다.                                         |
| [Zod 검증 경계](../apps/web/content/posts/zod-assertion-boundaries/ko.mdx)              | 관측·복구·차단의 선택과 기존 API의 제한을 확인했다. 모든 값을 fallback으로 감추는 설명은 없다.                              |

## 추가 확인이 필요한 구현

- 상담 어댑터의 대기 큐 취소와 메시지 중복 제거는 원본 앱에서 재현해야 한다. 글에는 현재 예제가 보장하지 못하는 범위를 적었다.
- 예약 폼은 인원수가 같은 교체와 이름 변경, 명시적인 검증 시점과 동기화 테스트가 남아 있다. 해당 사내 구현을 수정하는 작업은 이번 블로그 편집에 포함하지 않았다.
- Sentry 옵션·Next.js 동작처럼 버전과 연결된 설명은 다음 개정에서도 사용 버전의 소스나 태그를 함께 확인해야 한다.

## 대조한 외부 자료

- [ISTQB: White-box test technique](https://glossary.istqb.org/en_US/term/white-box-test-technique)
- [Fetch: HTTP-redirect fetch](https://fetch.spec.whatwg.org/#http-redirect-fetch)
- [Next.js #96831](https://github.com/vercel/next.js/issues/96831), [초기 PR #96834](https://github.com/vercel/next.js/pull/96834), [병합된 PR #97164](https://github.com/vercel/next.js/pull/97164)
- [react-modal-sheet #188](https://github.com/Temzasse/react-modal-sheet/issues/188)
- [TanStack Query: Optimistic Updates](https://tanstack.com/query/v5/docs/framework/react/guides/optimistic-updates)

## 검증 기록

- 콘텐츠 검증: 60개 언어판, 60개 정적 MDX import, 27개 리다이렉트.
- 타입·린트, 단위·컴포넌트 테스트 102개 통과. 원본 코드 블록과 보관 이미지의 해시 검사도 포함한다.
- 프로덕션 빌드: 199개 경로 생성.
- 데스크톱·모바일 E2E 42개 통과. 모든 한국어 글의 본문 표지·OG 일치, 60개 읽기 경로와 가로 넘침을 검사한다.
- 실제 목록에서 30개 썸네일을 검색해 이미지 디코딩과 표지 경로를 확인했다. 수정한 글 5편의 데스크톱·모바일 본문을 캡처하고 썸네일과 주요 본문 화면을 시각적으로 확인했다.
