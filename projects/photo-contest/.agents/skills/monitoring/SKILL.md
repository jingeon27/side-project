---
name: monitoring
description: 웃긴순간의 Sentry 오류 수집(API·웹·앱)과 Amplitude 제품 이벤트(웹·앱)를 설정하거나 이벤트를 추가할 때 사용한다.
---

## 나눔 (사용자 결정)

| 앱 | Sentry | Amplitude |
| --- | --- | --- |
| api | `@sentry/node` — 예상하지 못한 오류만 | 보내지 않는다. 도메인 이벤트는 DB `AnalyticsEvent`에 기록만(내부 지표용) |
| web | `@sentry/nextjs` — `src/instrumentation.ts`(서버, `onRequestError`)와 `src/instrumentation-client.ts`(클라이언트) | `@amplitude/analytics-browser` |
| mobile | `@sentry/react-native`(Expo 플러그인) | `@amplitude/analytics-react-native` |

- 키·DSN이 없으면 init하지 않고 아무것도 보내지 않는다(로컬·테스트 기본값). 키는 환경변수로만: API `SENTRY_DSN`, 웹 `NEXT_PUBLIC_SENTRY_DSN`·`NEXT_PUBLIC_AMPLITUDE_API_KEY`, 앱도 프로젝트 루트의 공개 키를 Expo extra로 읽는다. 별도 모바일 env 키는 만들지 않는다.
- `sendDefaultPii: false`, `beforeSend`에서 request·cookies·user·breadcrumbs를 지운다. 쿠키·세션·요청 본문은 어디에도 보내지 않는다.
- API는 4xx 업무 오류를 보내지 않는다. GraphQL 내부 오류(operationName 태그)와 REST 5xx(라우트 태그)만.
- 웹 Sentry 태그: `client=app|web`, 앱 WebView면 `app_version`(`buildSentryClientTags`). 트랜잭션 이름(`event.transaction`)은 보내기 전에 `path_template`(`/invite/:token`)로 바꾼다(오류·트랜잭션 이벤트 모두 `scrubSentryEvent`).
- 앱 Sentry는 공통 태그 없이 경고마다 태그를 붙인다: `webview_load_failed`는 `status`·`error_code`·`error_domain`, `webview_process_terminated`는 `process`·`did_crash`. 트레이싱·라우팅 계측이 없어 트랜잭션 이름을 만들지 않는다.
- 웹 Amplitude 사용자 속성: `client`, 앱 WebView면 `platform`·`app_version`.

## Amplitude 이벤트

- 이름은 snake_case, 카탈로그(웹 `src/shared/model/analytics`, 앱 `src/features/analytics`)의 `as const` 목록에 있는 것만 보낸다. 카탈로그에 없는 이름은 타입 오류여야 한다.
- 속성에 닉네임·캡션·초대 토큰·이메일을 넣지 않는다. ID(cuid)와 `path_template`(ID를 `:id`로 바꾼 경로)만.
- 서버 응답이 성공한 뒤(mutation 성공, 공유·복사 완료 후)에 보낸다.
- 페이지뷰는 자동 수집을 끄고 경로가 바뀔 때 `page_viewed`를 직접 보낸다.
- 로그인하면 `setUserId(user.id)`, 로그아웃하면 `reset()`. 세션 만료 등으로 비로그인이 확인되면 식별된 사용자가 남아 있을 때만 `reset()`하고(`forgetAnalyticsUser`) 앱에 `auth.changed { signedIn: false }`를 알린다(앱도 식별된 사용자가 있을 때만 reset). 앱 안의 웹은 앱이 넘긴 `analyticsDeviceId`를 기기 ID로 써서 네이티브와 같은 사용자로 묶이고, 웹이 `auth.changed { signedIn, userId }`로 앱에 알려 앱도 같은 userId를 쓴다.
- 현재 카탈로그
  - 웹: page_viewed, login_started, login_succeeded, group_created, group_joined, category_created, category_filter_applied, post_created, invite_link_copied, invite_link_shared, invite_link_regenerated, contest_created, photo_submitted, vote_cast, photo_liked, photo_unliked, photo_sort_changed, result_viewed, result_shared, contest_shared, photo_reported (공유 method = native | web_share | clipboard, 앱 기능이 지원되는지가 아니라 실제로 성공한 경로)
  - 앱: app_opened(source = launch | deep_link), app_foregrounded, deep_link_opened, social_login_started / succeeded / cancelled / failed, native_share_completed / dismissed, update_required_shown, webview_load_failed, webview_process_terminated
- 서버만 아는 지표(대회 종료 `contest_completed`, 참여 3명 이상 활성 대회)는 Amplitude가 아니라 DB `AnalyticsEvent`에서 본다.

## 추가할 때

1. 카탈로그에 이름과 속성 타입을 더한다.
2. 성공 지점에서 보낸다.
3. 테스트: 키가 없으면 아무것도 보내지 않는지, 해당 동작에서 이벤트가 한 번 나가는지(SDK 모듈을 vi.mock), 속성에 개인정보가 없는지.

## 실제 서비스 확인

- `@photo-contest/web monitoring:check`는 일반 테스트와 분리한 실제 전송 검사다. 3336/4336·web_e2e 격리 스키마·S3 대역·운영 빌드를 사용하며 수집 응답과 개인정보 제거를 단언한다. 확인 오류 종류는 MonitoringVerificationError다. 실제 수신은 MCP에서 eventId·페이지뷰 집계를 재조회한다.
- 자동 페이지뷰와 별개인 pageUrlEnrichment/customEnrichment도 꺼서 검색어가 보강되지 않게 한다. StrictMode에서 중복 방문을 집계하지 않는다.
- Sentry는 contexts.nextjs에도 원본 경로가 들어가므로 request만 지우지 않는다. service/layer로 API·Next 서버·브라우저를 구분한다.
