# Game Feedback REST SDK

서버 Zod 계약 → OpenAPI → Orval 순서로 생성한다. 모든 생성 JSON 요청은 응답 Zod 스키마를 `apiFetch`에 전달하며, transport가 HTTP 오류와 성공 본문을 검증한다. 앱에는 검증을 통과한 결과만 반환한다. WebView 모바일도 같은 Web SDK를 사용한다.

## 생성과 사용

```sh
corepack yarn workspace @side/game-feedback codegen
corepack yarn workspace @game-feedback/sdk typecheck
corepack yarn workspace @game-feedback/sdk test
```

앱의 `features/<domain>/api`에서는 `@game-feedback/sdk`의 생성 함수를 호출한다. Orval의 `schemas.type: zod`, `fetch.runtimeValidation`, `includeZodSchemaInArguments`가 응답 스키마를 자동 연결한다. 생성된 `.zod.ts`·client·validation 파일은 직접 수정하지 않는다. 호출자가 options로 스키마를 덮어쓸 수 없으며, transport는 스키마 없는 요청을 거부한다. 검증을 우회하던 raw API helper는 공개 API에서 제거했다.

서버 컴포넌트의 요청은 생성 함수의 options에 `baseUrl`과 필요한 header·AbortSignal을 전달할 수 있다. 이 값은 요청별이며 전역 설정이나 fetch를 교체하지 않는다. `baseUrl`·Zod schema 옵션은 실제 fetch init에 전달하지 않고, 브라우저의 기본 상대 `/api` URL·credentials·no-store 동작을 유지한다. Web의 server-only 어댑터는 신뢰한 API origin과 Game Feedback 세션 cookie만 전달한다. 공개 프로필도 같은 생성·검증 경로를 사용한다.

## 응답 fallback 정책

게시글은 기존 `body` 평문과 선택적인 Quill `document`, 게시판 `board`를 전달한다. 서버는 서식 문서에서 추출한 평문과 body의 일치를 확인하며 검색/SEO는 평문을 사용한다. 링크는 HTTP(S)만 허용하고 객체 embed나 임의 HTML 속성을 문서에 저장하지 않는다.

`uploadChatAttachment`는 FormData와 세션 쿠키를 사용하고 JSON 첨부 메타데이터를 Zod로 검증한다. Content-Type boundary는 fetch가 지정한다. 파일 URL, MIME, 종류, 크기와 ID는 엄격하게 검증하며 외부 파일 URL로 fallback하지 않는다. `deleteChatAttachment`는 미전송 파일 제거용이다. 메타데이터의 파일 URL은 세션이 필요한 바이너리 GET이며 동영상 Range 요청을 지원한다. 바이너리 다운로드와 SSE는 JSON transport 대상이 아니다.

서버 계약은 엄격하게 유지한다. SDK의 `src/response/fallback-policy.ts`가 스키마에 선언된 표시 필드에만 Zod `.catch(...)` 정책을 적용한 뒤 원래 응답 스키마로 전체를 다시 검증한다. 필드 이름이 같아도 fallback이 그 필드의 계약을 만족하지 않으면 적용하지 않는다. 원본 입력은 수정하지 않는다.

| 필드                                         | 누락·잘못된 타입·범위의 fallback                      |
| -------------------------------------------- | ----------------------------------------------------- |
| `nickname`                                   | `알 수 없는 플레이어`                                 |
| `name`                                       | `이름 없음`                                           |
| `description`                                | 빈 문자열                                             |
| `iconUrl`                                    | HTTP(S) 이미지 URL 또는 `null`. 잘못된 값은 `null`    |
| `supercellTag`                               | 유효한 대문자 태그 또는 `null`. 잘못된 값은 `null`    |
| `clan`                                       | 비어 있지 않은 문자열 또는 `null`. 잘못된 값은 `null` |
| `answerCount`, `helpfulCount`, `unreadCount` | 0 이상 안전한 정수. 잘못된 값은 `0`                   |
| `isVerified`                                 | 실제 boolean만 인정. 잘못된 값은 `false`              |

문자열 숫자·boolean을 자동 형변환하지 않는다. ID·권한·세션 플래그·페이지 커서·날짜·UUID·본문·리스트 구조·게임 프로필의 출처/소유권 표시는 fallback으로 꾸미지 않는다. 배열의 잘못된 원소도 제거하지 않는다. 실제 게임 수치·덱 레벨을 임의로 보완하지 않는다.

정상 HTTP 응답의 필수 계약이 어긋나거나 JSON이 아니면 `ApiResponseValidationError` (`INVALID_API_RESPONSE`)를 반환한다. HTTP status는 그대로 보존하고, `issues`에는 최대 20개의 필드 경로·오류 코드만 남긴다. 응답 본문·닉네임·메시지·토큰을 오류에 첨부하거나 로그로 출력하지 않는다. Web은 이를 네트워크 오류와 구분해 내용을 다시 확인하도록 안내한다.

HTTP 오류 본문은 코드·메시지의 타입을 검증하고 잘못되면 `REQUEST_FAILED`와 일반 안내를 사용한다. 원래 HTTP status와 정상 서버 오류 코드는 보존한다. 요청 또는 본문 읽기의 AbortError와 네트워크 오류는 그대로 전달한다. 계약이 JSON을 요구하는 작업의 204 응답을 성공으로 간주하지 않는다. 요청 본문·서버 입력 검증에는 응답 fallback을 적용하지 않는다.

SDK가 소유한 Vitest는 생성 클라이언트의 실제 호출·fallback·오류 처리를 검사한다. OpenAPI의 모든 operation이 생성 transport에 스키마를 전달하는지도 검사해 재생성 시 검증 누락을 막는다. 브라우저 회귀 테스트는 Web이 소유한다.
