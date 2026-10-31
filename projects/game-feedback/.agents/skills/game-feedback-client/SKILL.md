---
name: game-feedback-client
description: Game Mate Web과 Admin의 FSD 배치, REST query/mutation options, RHF/Zod 폼과 오류 경계를 구현하거나 리뷰할 때 사용한다. 일반 TypeScript/React 규칙은 루트 공통 스킬이 소유한다.
---

# Game Mate 클라이언트 조합

루트 공통 TypeScript·UI 규칙과 각 앱 AGENTS.md를 따른다. Web은 Next, Admin은 Vite이므로 서버 전용 모듈을 공유하지 않는다.

## 배치와 상태

- `_app`은 Provider·인증·라우트 조합, `_pages/<screen>`은 조회·폼·탐색과 하위 검증·UI·테스트, `widgets`는 여러 페이지의 공유 조합, `features`는 도메인 IO·캐시·재사용 표시, `shared`는 기반을 소유한다.
- slice 간에는 명시적인 index.ts를 통한다. 페이지 간 import·UI에서 SDK 직접 호출·상위 레이어 import를 금지한다. REST와 생성 응답 Zod 검증은 feature의 api 경계에 둔다.
- 독립 책임의 UI/model은 기능별 하위 폴더로 묶되 컴포넌트와 테스트를 함께 둔다. 로그인·문의·신고·제재처럼 목적이 다른 흐름을 mode prop으로 합치지 않는다.
- 조회·key는 `*.options.ts`의 queryOptions/infiniteQueryOptions, mutation의 IO·key·캐시 정책은 `*.mutation-options.ts`에 둔다. 호출부에서 useQuery/useMutation으로 조립하며 단순 래퍼 훅·key 배열 복제를 만들지 않는다.
- pending·error·재시도 변수는 mutation 상태, 폼은 목적별 useZodForm, 모달은 overlay-kit이 소유한다. QueryClient 같은 고정 자원은 lazy useState로 만든다.
- 계정 전환은 진행 중 query 취소 → 이전 계정 cache 제거 → 새 세션 저장 순서를 지킨다. 실패한 초안·재전송 UUID·읽음 경계를 보존한다.

## 조회와 폼 경계

- 목록·설정·상세 등 독립 작업은 해당 AsyncBoundary로 제한하고 ID/조회 조건으로 초기화한다. Web의 서버 첫 데이터·공개 본문과 Admin의 client 조회를 같은 Suspense 정책으로 바꾸지 않는다.
- URL 필터는 필드별 Zod fallback으로 읽고 소유 key만 변경한다. 권한·ID·404 판정은 엄격하다. 화면 기본값을 불필요하게 URL에 쓰지 않는다.
- 의미 있는 DTO↔폼·요청 변환만 순수 helper로 둔다. 단순 복사·markup·한 번의 options 호출 때문에 helper·훅을 만들지 않는다.
- 입력·모달·토큰은 @side/design-system을 사용한다. 고정 메뉴는 명시적 JSX, 서버 목록은 map으로 쓴다. 댓글·검색 같은 인라인 폼은 화면 하단으로 옮기지 않는다.
- Web의 켜짐/꺼짐 상태는 data/aria 속성으로 표시하고 CSS 속성 선택자로 꾸민다. cva는 재사용되는 다축/다값 variant만 소유하며 기본 버튼·입력 모양은 공통 디자인 시스템에 둔다.

## 검증

앱 lint·typecheck·관련 unit/UI와 탐색·초안 보존 E2E를 실행한다. API 경계만 대체한 UI 테스트, 실제 DB/서버 통합, 네이티브 실기기를 구분한다. 실행 절차는 [프로젝트 테스트](../game-feedback-testing/SKILL.md), 커밋은 [공통 절차](../../../../../.agents/skills/commit/SKILL.md)를 따른다.
