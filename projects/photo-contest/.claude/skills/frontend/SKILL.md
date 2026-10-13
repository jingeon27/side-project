---
name: frontend
description: 사진 공모전 웹의 화면 구조, Base UI 컴포넌트, 폼과 Apollo 상태를 추가하거나 변경할 때 사용한다.
---

`app`은 Next 라우팅만 맡는다. `src/_app`은 provider·스타일, `src/_pages`는 이름 붙인 화면 slice,
`src/features`는 서버 모델과 그 작업, `src/shared`는 도메인 없는 기반이다.
`_pages`의 `@page` 아래에서 화면 전용 slice를 구성하고 화면 내 공통 조각만 `@common`으로 올린다.

features는 서버 모델별 flat API·schema·UI로 둔다. 공유 UI는 의미 있는 compound 슬롯을 제공하되
컨텍스트를 실제로 공유하지 않는 카드까지 compound로 만들지 않는다.

폼 값은 RHF에만 둔다. Zod는 폼 입력과 서버 경계에서 검증하며 API operation 타입은 Codegen을 쓴다.
Apollo normalized cache가 서버 상태의 단일 출처다. 계정 변경은 새 문서 이동으로 캐시를 폐기한다.
개인 데이터를 Next의 공유 캐시에 넣지 않는다. SSR의 Cookie는 요청마다 전달한다.

Base UI `render`로 Trigger/Close를 Button과 합성한다. 키보드 focus, label, dialog 제목을 유지한다.
참고한 세이프닥 규칙과 달리 이 프로젝트는 TanStack Query가 아닌 Apollo를 사용한다.
