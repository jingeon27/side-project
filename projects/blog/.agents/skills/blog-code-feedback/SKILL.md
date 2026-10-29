---
name: blog-code-feedback
description: Apply the user's code structure and React UI feedback when implementing or reviewing projects/blog. Covers article layers, autocomplete search, inline callbacks, fixed JSX, and URL filter state; article prose follows blog-writer instead.
---

# 블로그 코드 피드백

`projects/blog` 애플리케이션을 수정하거나 리뷰할 때 적용한다. 이번 기준을 다른 프로젝트나 글의 문체 규칙으로 확대하지 않는다. 프로젝트와 앱의 `AGENTS.md`도 따른다.

- `entities` 레이어를 만들지 않는다. 글 데이터·타입·생성 레지스트리는 `shared/article`, 글 카드·메타 UI는 `features/article`에 둔다. 이동 시 import, 생성 경로, 린트·테스트 경로를 함께 바꾼다. 기존 발행 인덱스의 Git 경로를 읽는 URL 삭제 검증도 보존한다.
- 고정 메뉴, 카테고리 버튼, 고정 안내 섹션은 명시적인 JSX로 쓴다. 고정 배열을 만들고 `map`으로 감싸지 않는다. 글·태그·검색 결과·목차와 발행 데이터에서 계산한 목록은 동적이므로 `map`을 유지한다.
- `else`·`else if`는 쓰지 않는다. 가드절·조기 반환으로 흐름을 분리하고, 닫힌 다중 상태는 exhaustive 매칭으로 처리한다. 이항 조건까지 불필요하게 추상화하지 않는다. ESLint가 블로그 코드·스크립트·테스트의 `else`를 검사한다.
- 한 번만 쓰는 콜백은 가능한 한 사용하는 곳에 인라인 화살표 함수로 쓴다. 재사용하거나 이벤트 등록·해제에 동일 참조가 필요한 함수는 이름을 유지한다. 컴포넌트 내부의 함수는 `const` 화살표 함수 표현식으로 선언한다. 이 기준 때문에 모듈 수준 컴포넌트나 재귀 유틸리티까지 기계적으로 인라인화하지 않는다.
- 검색어와 선택 카테고리는 URL `q`, `category`를 단일 출처로 삼고 `useState`에 복제하지 않는다. 단순 검색어 변경은 `window.history.replaceState`와 `useSearchParams` 연동을 사용한다. 뒤로 가기로 복원할 선택 변경은 `pushState`를 쓴다. 다른 query·hash, 고정 카테고리·태그 경로 범위를 보존하고 잘못된 카테고리는 전체로 해석한다. 정적 페이지의 Suspense와 초기 글 목록도 보존한다.
- outside click, 포커스 이동·복귀·트랩, Escape로 닫기와 ARIA 연결은 기존 UI 라이브러리의 프리미티브에 맡긴다. 팝업·드롭다운·다이얼로그에서 같은 동작을 document 리스너나 수동 DOM 검사로 재구현하지 않는다. 먼저 설치된 라이브러리의 지원 API를 확인한다.
- effect가 등록한 전역 단축키처럼 최신 렌더 값이 필요한 이벤트 처리는 `useEffectEvent`로 분리하고 effect에는 구독·해제만 둔다. Effect Event를 의존성 회피 용도로 쓰거나 일반 JSX 이벤트 핸들러에 사용하지 않는다.
- 검색은 Base UI Autocomplete를 사용하고 앱에는 검색 계산, 선택 후 이동·태그 적용, 전역 검색 단축키만 둔다. 브라우저 IME 호환 처리처럼 남겨야 하는 최소 예외는 실제 회귀 테스트로 검증한다.

- 닫힌 다중 상태 분기는 `ts-pattern`의 exhaustive 매칭을, 정규화 기준 중복 제거·집계·정렬은 `es-toolkit`의 적합한 함수를 우선 검토한다. 단순 이항 조건·네이티브 메서드까지 기계적으로 바꾸거나 고정 JSX를 다시 배열 기반 렌더링으로 만들지 않는다. 의존성은 루트 catalog를 참조한다.

리뷰할 때 기존 동작 보존과 위 기준을 함께 확인한다. URL 직접 진입·새로고침·뒤로/앞으로 가기, 검색·초기화와 고정 경로 범위를 실제 테스트한다. UI 변경은 프로덕션 빌드와 데스크톱·모바일 E2E까지 확인하고, 실제 실행 결과만 보고한다.

- `useRef`를 기본 상태 저장소로 쓰지 않는다. 순수 계산·파생 값, state/reducer, 외부 store·구독 API를 먼저 검토한다. `const` 객체 속성 변경이나 불필요한 class로 가변 상태를 숨기지 않는다. ref는 DOM 포커스처럼 명확한 imperative 자원에 대안이 부적절한 경우만 유지한다.

- 생성자 인자를 그대로 보관하는 클래스 필드는 별도 선언·대입 대신 TypeScript parameter property로 합친다. 접근 범위·readonly·인자 순서는 보존하고 단순 초기값은 기본 인자를 검토한다. 변환·검증·자원 생성을 억지로 인자로 노출하지 않으며, 기본 인자에서 아직 초기화되지 않은 인스턴스 필드·화살표 핸들러를 참조하지 않는다. 필드 초기화와 `super()` 순서를 보존한다.

- 추가 처리나 인자 변환이 없는 콜백은 불필요한 화살표 래퍼·별칭 대신 함수 참조를 직접 넘긴다. 이벤트 객체가 옵션 인자로 전달되거나 this 바인딩·지연 평가·반환형 조정이 필요한 래퍼는 유지한다. `useEffectEvent`의 최신 값 연결 역할은 보존한다.
- `.then()` 체인보다 `async`/`await`와 필요한 `try/catch/finally`를 우선한다. 불필요하게 오류를 삼키지 말고 상위에서 처리할 오류는 전파한다. 기존 병렬 실행·취소·정리·오류 처리 범위를 보존한다.

## URL 입력·화면 구성 검토 기준

- URL 필터는 소유 화면인 `widgets/blog-feed/model`의 Zod 스키마로 읽고 각 필드에 `.catch(undefined)`를 둔다. 잘못된 category 하나 때문에 q까지 초기화하지 않는다. 입력 중인 공백·대소문자를 임의로 변환하지 않는다. URL을 쓸 때는 파싱 결과로 재조립하지 않고 현재 URL의 소유 키만 바꿔 알 수 없는 query·중복 키·hash를 보존한다.
- 화면 뼈대와 실패 가능한 구획을 구분하되 실제 비동기 실패·복구 단위가 있을 때만 경계를 추가한다. 정적 Git MDX·생성 레지스트리를 클라이언트 조회나 id 재조회로 바꾸지 않는다. 기존 라우트 error.tsx와 URL 읽기용 Suspense·초기 글 목록을 유지한다.
- URL·파생 목록을 state로 복제하지 않는다. 한 곳에서만 쓰는 전달 래퍼·공용 훅·템플릿을 만들지 않으며, 독립적인 훅·수명을 가진 구획만 분리한다.
- 편집 폼이 실제로 생겼을 때만 입력 스키마와 제출 변환을 둔다. Autocomplete 검색 입력을 저장 폼으로 바꾸거나 빈 폼 계층을 미리 만들지 않는다.
- 스키마·순수 계산은 node 단위 테스트, 렌더와 단순 입력은 기존 컴포넌트 테스트, URL 이동·새로고침·브라우저 history는 실제 Playwright로 확인한다. 라우터 mock 통과만으로 이동이 검증됐다고 보고하지 않는다.
