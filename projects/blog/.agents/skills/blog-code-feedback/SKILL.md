---
name: blog-code-feedback
description: Apply the user's code structure and React UI feedback when implementing or reviewing projects/blog. Covers article layers, autocomplete search, inline callbacks, fixed JSX, and URL filter state; article prose follows blog-writer instead.
---

# 블로그 코드 피드백

`projects/blog` 애플리케이션을 수정하거나 리뷰할 때 적용한다. 이번 기준을 다른 프로젝트나 글의 문체 규칙으로 확대하지 않는다. 프로젝트와 앱의 `AGENTS.md`도 따른다.

- `entities` 레이어를 만들지 않는다. 글 데이터·타입·생성 레지스트리는 `shared/article`, 글 카드·메타 UI는 `features/article`에 둔다. 이동 시 import, 생성 경로, 린트·테스트 경로를 함께 바꾼다. 기존 발행 인덱스의 Git 경로를 읽는 URL 삭제 검증도 보존한다.
- 고정 메뉴, 카테고리 버튼, 고정 안내 섹션은 명시적인 JSX로 쓴다. 고정 배열을 만들고 `map`으로 감싸지 않는다. 글·태그·검색 결과·목차와 발행 데이터에서 계산한 목록은 동적이므로 `map`을 유지한다.
- 한 번만 쓰는 콜백은 가능한 한 사용하는 곳에 인라인 화살표 함수로 쓴다. 재사용하거나 이벤트 등록·해제에 동일 참조가 필요한 함수는 이름을 유지한다. 컴포넌트 내부의 함수는 `const` 화살표 함수 표현식으로 선언한다. 이 기준 때문에 모듈 수준 컴포넌트나 재귀 유틸리티까지 기계적으로 인라인화하지 않는다.
- 검색어와 선택 카테고리는 URL `q`, `category`를 단일 출처로 삼고 `useState`에 복제하지 않는다. 단순 검색어 변경은 `window.history.replaceState`와 `useSearchParams` 연동을 사용한다. 뒤로 가기로 복원할 선택 변경은 `pushState`를 쓴다. 다른 query·hash, 고정 카테고리·태그 경로 범위를 보존하고 잘못된 카테고리는 전체로 해석한다. 정적 페이지의 Suspense와 초기 글 목록도 보존한다.
- 검색 팝업은 Base UI Autocomplete처럼 outside click·포커스 이동·Escape·ARIA를 담당하는 표준 프리미티브를 사용한다. cmdk만으로 팝업까지 수동 구현하거나 document pointerdown·contains 검사·DOM ARIA 수정·다중 키보드 분기를 쌓지 않는다. 앱에는 검색 계산, 선택 후 이동·태그 적용, 전역 검색 단축키만 둔다. 브라우저 IME 호환 처리처럼 남겨야 하는 최소 예외는 실제 회귀 테스트로 검증한다.

- 닫힌 다중 상태 분기는 `ts-pattern`의 exhaustive 매칭을, 정규화 기준 중복 제거·집계·정렬은 `es-toolkit`의 적합한 함수를 우선 검토한다. 단순 이항 조건·네이티브 메서드까지 기계적으로 바꾸거나 고정 JSX를 다시 배열 기반 렌더링으로 만들지 않는다. 의존성은 루트 catalog를 참조한다.

리뷰할 때 기존 동작 보존과 위 기준을 함께 확인한다. URL 직접 진입·새로고침·뒤로/앞으로 가기, 검색·초기화와 고정 경로 범위를 실제 테스트한다. UI 변경은 프로덕션 빌드와 데스크톱·모바일 E2E까지 확인하고, 실제 실행 결과만 보고한다.
