---
name: blog-code-feedback
description: 블로그 앱의 글 레이어, Base UI 검색, URL 필터와 정적 콘텐츠 경계를 구현하거나 리뷰할 때 사용한다. 일반 TS/React 규칙은 루트 공통 스킬, 글 문체는 blog-writer가 소유한다.
---

# 블로그 애플리케이션

프로젝트·앱 AGENTS.md와 루트 공통 TypeScript/React 규칙을 따른다. 문체 피드백을 코드나 다른 서비스에 확대하지 않는다.

- entities를 만들지 않는다. 글 데이터·타입·생성 레지스트리는 shared/article, 카드·메타 표시는 features/article에 둔다. 경로 이동 시 생성·테스트·lint와 기존 발행 인덱스의 URL 삭제 검증을 함께 유지한다.
- 고정 메뉴·분류·안내 섹션은 명시적 JSX, 발행 데이터의 글·태그·목차·검색 결과는 map으로 쓴다.
- 검색은 설치된 Base UI Autocomplete가 팝업·focus·Escape·ARIA를 소유한다. 앱에는 검색 계산·선택 후 이동·전역 단축키만 두고 IME 예외는 실제 회귀 테스트로 검증한다.
- q와 category는 URL이 단일 출처다. 입력은 replaceState, 뒤로 가기로 복원할 선택은 pushState를 기존 useSearchParams와 연결한다. 소유 key만 변경해 다른 query·중복 key·hash와 고정 카테고리/태그 경로를 보존한다.
- widgets/blog-feed/model의 필드별 Zod catch(undefined)로 잘못된 필터만 되돌린다. 입력 중 공백·대소문자를 임의로 변환하지 않는다.
- Git MDX·생성 레지스트리를 클라이언트 API 조회나 ID 재조회로 바꾸지 않는다. 기존 라우트 error.tsx, URL 읽기용 Suspense와 서버 초기 글 목록을 보존한다.
- 편집 기능을 요청받았을 때만 저장 폼·제출 변환을 만든다. Autocomplete를 저장 폼으로 바꾸거나 미래를 위한 폼 계층을 추가하지 않는다.
- 순수 계산은 node unit, 렌더·단순 입력은 기존 UI 테스트, URL 직접 진입·새로고침·뒤로/앞으로는 실제 Playwright로 확인한다. UI 변경은 운영 빌드와 모바일·데스크톱 E2E를 확인하고 mock 통과만으로 탐색 성공을 주장하지 않는다.
