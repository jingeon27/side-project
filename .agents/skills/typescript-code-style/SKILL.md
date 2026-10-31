---
name: typescript-code-style
description: 이 모노레포의 TypeScript와 React 코드를 작성하거나 리뷰할 때 공통 명명, 분기, 콜백, 비동기 처리와 구독 수명 규칙을 적용한다. 프로젝트별 상태 관리와 제품 정책은 해당 프로젝트 지침을 따른다.
---

# TypeScript와 React 공통 규칙

생성 코드는 고치지 않는다. 설치된 타입, 실행기와 기존 lint 설정을 확인하며 프로젝트별 IO·상태 관리 방식은 바꾸지 않는다. 블로그 문체에는 적용하지 않는다.

## 타입과 계산

- `const`와 순수 반환값을 사용한다. `let`을 없애려고 임시 객체 속성을 재할당하거나 ref·class로 가변 상태를 숨기지 않는다.
- 날짜 생성·파싱·계산·비교는 `dayjs`를 사용하고 `new Date()`, `Date.now()`, `Date.parse()`를 새로 쓰지 않는다. Prisma·Intl·외부 라이브러리처럼 native Date가 필요한 경계에서만 `.toDate()`로 변환한다. 정해진 시각을 다루는 테스트도 같은 규칙을 따른다. TTL처럼 경과 시간을 계산할 때는 초·시간 단위로 기존 밀리초 의미를 보존하고, 달력 날짜·UTC·표시 시간대 정책을 바꾸지 않는다. 성능 측정용 단조 시계 `performance.now()`와 생성 코드·외부 계약의 Date 타입은 기계적으로 치환하지 않는다.
- `else` 대신 가드·조기 반환을 쓴다. `interface I*`, `type T*`, named export와 필요한 이름의 명시적 re-export를 사용한다. 프레임워크가 요구하는 default export와 프로젝트가 정한 테스트의 타입 예외는 유지한다. 일반 구현에 any·non-null assertion·enum을 새로 추가하지 않는다.
- 설정·조회표는 `satisfies`로 모양을 검사하고 리터럴이 필요할 때만 `as const satisfies T`를 쓴다. 유니온 키 표는 Record/Partial로 누락·추가를 검사한다. 프레임워크 export·의도적으로 넓은 사전·인라인 인자 타입을 기계적으로 좁히지 않는다.
- 같은 판별 값의 3갈래 이상 분기·중첩 삼항·닫힌 switch는 `ts-pattern`의 exhaustive match로 쓴다. 열린 오류 문자열만 otherwise로 처리한다. 단순 이항 조건·가드·뜨거운 반복문은 일반 코드로 둔다. **피식 mobile·bridge는 ts-pattern을 추가하지 않고 판별 유니온·satisfies 표를 쓴다.**
- 중복 제거·집계·정렬은 설치된 `es-toolkit`을 우선 검토하되 단순 네이티브 연산을 억지로 바꾸지 않는다.
- 생성자 인자를 그대로 저장하면 parameter property를 검토한다. 접근 수준·readonly·인자/초기화/super 순서를 보존하며 변환·자원 생성을 기본 인자로 노출하지 않는다. `node file.ts`의 strip-only 실행 경로에는 지원하지 않는 parameter property를 넣지 않는다.

## 함수와 비동기 흐름

- 컴포넌트는 PascalCase 파일의 named function, 다른 파일은 kebab-case로 둔다. 추출한 로컬 이벤트는 `const handle* = …`, prop은 `on*`로 쓴다. 피식·블로그는 한 번 쓰는 핸들러를 인라인으로, Game Mate는 명명한 로컬 핸들러를 우선하는 기존 차이를 유지한다.
- 단순 전달은 기존 함수 참조를 직접 넘긴다. 인자 차단·변환, receiver, 지연 평가, 반환값·cleanup·함수 identity가 다르면 래퍼를 유지한다. typed arrow·단일 return 함수도 같은 기준으로 판단하며 이름만 맞추는 별칭을 만들지 않는다.
- JSX `on*`에 React setter를 연결할 때는 `onOpenChange={(value) => setOpen(value)}`처럼 새 값 하나만 전달하는 어댑터를 유지한다. 일반 API·props·Server Action에 일괄 적용하지 않고 안정적인 DOM ref도 인라인 래퍼로 바꾸지 않는다.
- Promise 체인보다 async/await와 필요한 try/catch/finally를 쓴다. 병렬 시작·race·순서·취소·늦은 응답 무시·잠금 해제·실패 후 재시도와 오류 전파/흡수 범위를 보존한다. fire-and-forget catch나 Zod catch를 바꾸기 위한 추상화는 만들지 않는다.
- 명명은 기존 `react/jsx-handler-names` 설정과 리뷰로 지킨다. local/inline 검사를 끈 옵션이 실제로 검사한다고 주장하거나 명명 전용 커스텀 규칙·disable·전달 래퍼를 추가하지 않는다.

## React 경계와 수명

- 서버 응답은 프로젝트의 서버 캐시, 폼 초안은 RHF/Zod, 선택·필터는 URL이 소유한다. 이를 useState/ref에 복제하지 않는다. 상태·오류·재시도 값은 해당 라이브러리의 결과를 사용한다.
- 페이지 전용 조회·폼·탐색 조합과 하위 검증·테스트는 소유 화면에 둔다. 재사용 도메인 IO·표시와 여러 페이지의 조합을 구분하며 사용처 하나를 위해 범용 모드·훅·템플릿을 만들지 않는다.
- 역할에 따라 훅·요청·수명이 다를 때만 로컬 컴포넌트를 나눈다. 비동기 실패 영역은 필터·탭·다른 상세와 초안을 unmount하지 않는 경계로 제한하고 해당 자원의 ID·조회 조건으로 초기화한다. 정적 글에 불필요한 조회 경계를 추가하지 않는다.
- URL은 필드별 검증으로 유효한 형제 값을 보존한다. 쓰기는 원본 URL의 소유 키만 바꾸어 다른 query·중복 키·hash를 보존한다. 권한·ID·404 가드는 엄격하게 유지한다.
- DOM 연결에만 의존하는 listener·observer·미디어 정리는 안정적인 callback ref와 반환 cleanup으로 노드 교체·StrictMode·제거를 처리한다. RHF/ref 조합의 연결·해제를 보존하고 파일·요청·전역 구독을 억지로 DOM 수명으로 옮기지 않는다.
- effect 구독에서 최신 props/상태만 읽는 콜백은 `useEffectEvent`로 분리한다. 실제 구독 대상·활성 조건은 reactive dependency에 남긴다. Effect Event를 JSX·callback ref·네이티브 채널·일반 API로 넘기거나 의존성 우회에 쓰지 않는다.
- 외부 상태 표시는 `useSyncExternalStore`, 사용자 조작은 일반 핸들러를 쓴다. QueryClient·채널처럼 수명이 고정된 자원의 lazy useState는 허용한다. ref는 포커스·취소 등 실제 imperative 자원에 필요한 경우만 쓴다.
- outside-click·포커스 복귀/트랩·Escape·ARIA·키보드 탐색은 기존 UI primitive에 맡긴다. 앱은 도메인 동작·history·portal·브리지만 조합한다. DOM primitive를 네이티브 OS 기능의 대체재로 쓰지 않는다.
- 수명 변경은 콜백 교체·StrictMode 재연결·unmount 뒤 응답·실패 초안 보존을 동작으로 검증한다. 문구·구현을 그대로 복사하는 테스트를 추가하지 않는다.
