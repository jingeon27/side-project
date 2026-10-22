---
name: testing
description: 웃긴순간의 앱별 테스트 레인(Vitest unit·ui·api·integration, Playwright e2e), 격리 DB 스키마, 테스트 포트, BDD 이름 규칙에 맞춰 테스트를 작성하거나 실행할 때 사용한다.
---

## 소유권

러너 설정·러너 의존성·테스트 파일은 각 앱(또는 패키지)이 가진다. 루트·프로젝트 루트에 테스트 파일이나 Vitest/Playwright 설정을 두지 않고, 공용 e2e 워크스페이스를 만들지 않는다. API에는 Playwright가 없다.

| 앱 | `test` (서버 없음) | `test:api` | `test:e2e` |
| --- | --- | --- | --- |
| api | Vitest unit: `src/**/*.{spec,test}.ts` 중 `*.integration.{spec,test}.ts` 제외 | 없음 | Vitest integration(`test:integration`): `src/**/*.integration.{spec,test}.ts`, 실제 PostgreSQL 격리 스키마, `createApp()` + supertest(포트를 열지 않는다). `test:e2e`는 호환 이름 |
| web | Vitest unit(node) + ui(jsdom) | Vitest api: `src/**/*.api.spec.ts` — 앱이 쓰는 GraphQL 문서를 격리 API(:4321)에 실행 | Playwright: `mobile-chrome`(Pixel 7, 기본), `mobile-safari`(iPhone 15 WebKit), `desktop-chrome`(@desktop 스모크), `webview`(가짜 앱 호스트). API :4320 + 웹 :3320 |
| mobile | Vitest unit + ui(`react-native` → `react-native-web`) | Vitest api: 앱이 직접 부르는 엔드포인트를 격리 API(:4331)에 | Playwright `android-webview`·`ios-webview`: 실제 웹(:3330) + 앱의 실제 라우터·기능 로직(native-host 픽스처), API :4330 |
| bridge | Vitest(node·jsdom) | — | — |

프로젝트 루트의 `test`·`test:unit`·`test:api`·`test:e2e`는 `yarn workspaces foreach`로 각 앱에 위임만 한다(api·e2e 레인은 직렬).

## 규칙

- 새 동작은 `*.spec.ts(x)`, 확인된 버그의 재발 방지는 `*.test.ts(x)`. `describe`는 대상 이름, `it`은 `~해야 한다`. unit·integration 테스트는 모두 대상 구현 파일 바로 옆에 두고 별도 테스트 디렉터리로 모으지 않는다. API의 실제 DB·supertest 테스트는 `*.integration.spec.ts`·`*.integration.test.ts`로 구분하고 공용 하네스는 `test/support/`에 둔다.
- 목은 마지막 수단이다. 폼은 실제 RHF·Base UI로, 캐시는 실제 InMemoryCache로, API는 실제 PostgreSQL로 검증한다. 외부 OAuth provider·Amplitude·Sentry 전송처럼 밖으로 나가는 경계만 대체한다(supertest는 fetch를 쓰지 않으므로 provider용 `vi.stubGlobal('fetch')`와 섞이지 않는다).
- 의미 없는 호출 횟수 대신 사용자 동작과 서버·DB 결과를 단언한다. 기다리지 않고 `queryBy… not.toBeInTheDocument()`만 확인하는 '초록인데 빈' 테스트를 만들지 않는다.
- 권한·동시성은 실제 요청으로 확인한다(예: 같은 사용자의 동시 투표 8건 → 정확히 1건).
- 외부 OAuth는 credentials 없이 실제 성공을 주장하지 않는다.

## DB·서버 격리

- DB를 쓰는 테스트는 `@photo-contest/test-kit`으로 `<레인 접두사>_<uuid 32자>` 스키마를 만들고(마이그레이션 적용) 끝나면 그 스키마만 지운다. 접두사는 `TEST_SCHEMA_PREFIXES`(`api_test`·`web_api`·`web_e2e`·`web_cache`·`mobile_api`·`mobile_e2e`)만 쓰고, 새 레인은 거기에 먼저 추가한다. `public` 등 다른 이름은 만들거나 지우기 전에 거부한다.
- 테스트 DB는 `TEST_DATABASE_URL` 하나다. loopback(`127.0.0.1`·`localhost`·`[::1]`)·전용 포트(`LOCAL_TEST_POSTGRES_PORT`, 기본 55434)·`photo_contest_test`만 허용하고, 비어 있어도 개발 `DATABASE_URL`(55432)로 대신하지 않는다. 밖에서 넣은 `PC_E2E_SCHEMA`·`PC_E2E_BASE_DATABASE_URL`·`PC_E2E_STORAGE_DIR`(프로젝트 `.data` 아래만)도 같은 규칙으로 검사한다.
- 테스트 API는 test-kit이 `apps/api/.e2e-build`로 빌드해 띄운다(개발 서버가 보는 `dist`를 건드리지 않는다). 웹 e2e의 Next dev는 `NEXT_DIST_DIR=.next/e2e`(모바일 e2e는 `.next/e2e-mobile`)로 띄워 개발 서버의 `.next/dev` 잠금과 겹치지 않게 한다.
- 개발 서버 포트(웹 3200, API 4200, DB 55432)는 테스트에 쓰지 않고, 실행 중인 서버를 재사용하거나 끄지 않는다(`reuseExistingServer: false`).
- `.env`는 설정 파일이 `process.loadEnvFile`로 읽는다. 테스트에 필요한 환경변수는 설정에서 명시한다.
- 미디어는 test-kit S3 대역(`startFakeS3`)을 쓴다. API 통합은 globalSetup이, 웹·모바일 레인은 테스트 API 실행기가 빈 포트에 띄우고 끝나면 객체 폴더까지 지운다. 개발자 `.env`의 실제 S3·AWS 값은 테스트 API에 넘기지 않는다.

## Playwright

- 모든 spec은 앱의 `e2e/support/test.ts`(웹)·픽스처를 import한다(Next 개발 오버레이 숨김, pageerror 수집, 테스트 API로 만든 세션 `signIn`).
- 개발 서버 대상은 workers 1. 선택자는 역할·레이블로 찾고, 앱 e2e의 웹 선택자는 `e2e/support/web-screens.ts`에만 둔다.
- 화면 캡처는 `.data/`에 남기되 픽셀 비교 단언은 하지 않는다. 휴대폰 화면에서 가로 넘침이 없는지 확인한다.

## 명령 (side 루트, `corepack yarn`)

```sh
yarn workspace @photo-contest/api test        # unit
yarn workspace @photo-contest/api test:integration # 실제 DB + supertest (test:e2e도 호환)
yarn workspace @photo-contest/web test        # unit + ui
yarn workspace @photo-contest/web test:api    # 생성 문서 ↔ 격리 API
yarn workspace @photo-contest/web test:e2e    # 첫 실행 전: yarn workspace @photo-contest/web exec playwright install chromium webkit
yarn workspace @photo-contest/mobile test
yarn workspace @photo-contest/mobile test:api
yarn workspace @photo-contest/mobile test:e2e
yarn test:photo-contest                       # 프로젝트 전체 unit
```

테스트 통과, diff 확인, 실제 화면 확인은 서로를 대체하지 않는다.

## 테스트 fixture API

- 격리 API는 NODE_ENV=test·ENABLE_TEST_API=true, 개발 로그인 false로 시작한다. 실제 OAuth·Sentry 키는 기본값에서 지우고 필요한 경계 테스트만 가짜 값을 지정한다.
- 웹·모바일 준비는 test-kit의 createTestUser·moveTestContest·createTestAppLoginTicket와 제품 GraphQL·업로드 API를 쓴다. DB를 직접 고치지 않는다.
- API integration은 제약·만료·실패 조건을 위해 test/support에서 격리 DB를 준비하고 결과를 확인할 수 있다.
- 모든 레인이 끝난 뒤 `yarn workspace @photo-contest/test-kit check:cleanup`으로 스키마 정리를 확인한다. 실행 중인 레인의 스키마는 정리 대상이 아니다.

API `test:e2e`는 `test:integration`에 위임하는 호환 이름이다. 새 사양은 unit·integration 모두 `.spec.ts`로 만든다. 그룹 대회·부관리자·양도는 실제 DB에서 권한·동시 투표·동시 양도·복합 FK·접수 마감·비공개 결과를 검증한다. 웹은 생성 문서·실제 API와 Chrome/WebKit/데스크톱에서 개최→참여→투표→명예의 전당을 검사한다. SEO는 cookie 없는 조회·공개만 있는 48개 분할 사이트맵·서버 HTML·canonical·JSON-LD를 확인한다.
