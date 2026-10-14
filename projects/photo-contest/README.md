# 웃긴순간

친구들과 비공개 그룹을 만들고 사진 한 장씩 제출한 뒤 한 표로 우승작을 뽑는 서비스입니다. 웹과 Expo WebView 앱이 같은 HttpOnly 세션과 GraphQL API를 사용합니다.

## 실행

Node.js 24(`.nvmrc`)·Corepack·Yarn 4.17을 사용합니다. 저장소 루트에서 실행하세요.

```sh
corepack yarn install --immutable
cp projects/photo-contest/.env.example projects/photo-contest/.env
corepack yarn workspace @side/photo-contest db:generate
corepack yarn workspace @side/photo-contest codegen
corepack yarn workspace @side/photo-contest db:local
```

별도 터미널에서 해당 개발 DB에 마이그레이션을 적용하고 서버를 시작합니다.

```sh
corepack yarn workspace @side/photo-contest db:migrate
corepack yarn dev:photo-contest
```

- 웹: http://localhost:3200
- API: http://127.0.0.1:4200, 브라우저에서는 같은 origin의 `/backend/*` 프록시로 호출
- 기본 로컬 DB: 55432. `LOCAL_POSTGRES_PORT`와 `DATABASE_URL`을 함께 바꿔 프로젝트별로 분리
- DB·사진: 프로젝트 `.data/postgres`·`.data/photos`

`NODE_ENV=development`와 `ENABLE_DEV_LOGIN=true`가 모두 있어야 닉네임 로그인이 열립니다. 같은 닉네임은 같은 개발 계정입니다. 다른 브라우저 프로필에서 친구 계정으로 초대 링크를 열어보세요.

## 구성과 기능

| 앱·패키지           | 역할                                                                          |
| ------------------- | ----------------------------------------------------------------------------- |
| `apps/api`          | NestJS 12 schema-first GraphQL·인증/업로드 REST, Prisma 6·PostgreSQL          |
| `apps/web`          | Next.js 16 App Router, Apollo Client 4, Base UI·RHF·Zod, 홈·MY·그룹·초대·대회 |
| `apps/mobile`       | Expo SDK 57 WebView 셸, 시스템 브라우저 로그인·공유·클립보드·햅틱·딥링크      |
| `packages/bridge`   | zod로 검사하는 앱↔웹 메시지 계약                                              |
| `packages/test-kit` | 테스트 DB 격리·API 기동·이미지·fixture 준비                                   |

그룹은 비공개이며 모든 멤버가 초대 링크를 공유할 수 있고, 관리자만 재발급·대회 생성·사진 숨김/삭제를 수행합니다. 1인 1장·1인 1표는 DB unique와 Serializable 재시도로 보장합니다. 좋아요 수는 항상, 득표수는 종료 후에만 공개합니다. 공동 우승·무투표·그룹 순위·지난 대회를 지원합니다.

사진 목록은 정렬별 `offsetLimitPagination`으로 24장씩 받습니다. 좋아요·투표는 Apollo의 낙관적 응답과 실패 롤백을 사용합니다. 사진을 숨기거나 삭제하면 목록의 offset이 달라지므로 첫 페이지부터 다시 받습니다. 사용자 변경은 문서 이동으로 캐시를 버립니다.

진행 중인 대회 정보는 로그인한 사용자에게 30초마다 갱신해 마감 이후 화면을 전환합니다. 사진 목록은 주기적으로 조회하지 않습니다.

## 모바일 앱

Expo Go 대신 dev client 또는 스토어 빌드를 사용합니다.

```sh
APP_VARIANT=development corepack yarn workspace @photo-contest/mobile android
APP_VARIANT=development corepack yarn workspace @photo-contest/mobile ios
corepack yarn workspace @photo-contest/mobile start
corepack yarn workspace @photo-contest/mobile bundle:check
```

`EXPO_PUBLIC_WEB_ORIGIN`을 웹 주소로 설정하고 Android 에뮬레이터에서는 `adb reverse tcp:3200 tcp:3200`을 사용합니다. 쿠키는 WebView가 보관합니다. Google 로그인을 WebView에서 열지 않고 시스템 브라우저·PKCE·일회용 코드 교환으로 처리합니다. 최소 버전 확인 실패는 시작을 막지 않습니다.

## 인증·저장소·모니터링

Google·카카오 앱의 callback은 `https://<웹 도메인>/backend/auth/<provider>/callback`입니다. 실제 OAuth 앱과 계정으로 하는 인증은 별도 설정 후 확인해야 합니다.

운영은 `NODE_ENV=production`, HTTPS `WEB_ORIGIN`, `DATABASE_URL`, 영속 `STORAGE_DIR` 또는 private S3 호환 버킷이 필요합니다. 별도 컨테이너에서 API를 실행하면 `API_HOST`를 명시하고 웹 프록시를 통해 접근하게 구성합니다.

파일은 일회용 업로드 주소로 API에 전송합니다. API가 실제 형식·40MP·10MB를 검사하고 1600px WebP로 바꾸며 메타데이터를 제거합니다. 매 파일 조회에서 그룹 권한을 확인하고 `private, no-store`로 응답합니다. S3/R2 어댑터는 실제 버킷 권한으로 별도 검증해야 합니다.

| 앱     | 오류 수집                                               | 사용자 행동 측정                |
| ------ | ------------------------------------------------------- | ------------------------------- |
| API    | `SENTRY_DSN`, 내부 GraphQL 오류·REST 5xx·주기 작업 실패 | 도메인 이벤트를 DB에만 기록     |
| 웹     | `NEXT_PUBLIC_SENTRY_DSN`, 서버는 `SENTRY_DSN` 우선      | `NEXT_PUBLIC_AMPLITUDE_API_KEY` |
| 모바일 | `EXPO_PUBLIC_SENTRY_DSN`                                | `EXPO_PUBLIC_AMPLITUDE_API_KEY` |

키가 없으면 전송하지 않습니다. 요청·쿠키·사용자 정보를 제거하고 분석 속성에 닉네임·설명·초대 토큰을 넣지 않습니다. 앱과 웹은 브리지의 기기 ID로 분석 사용자를 연결합니다. 실제 Sentry·Amplitude 프로젝트 수신은 별도 확인이 필요합니다.

## 앱별 테스트

| 앱     | `test`                   | `test:api`                                | `test:e2e`                                                   |
| ------ | ------------------------ | ----------------------------------------- | ------------------------------------------------------------ |
| API    | 순수 규칙·사진 처리 unit | 없음                                      | Vitest + supertest + 실제 PostgreSQL, `test/e2e`             |
| 웹     | unit·실제 폼/캐시 UI     | 생성 GraphQL 문서를 격리 API에 실행(4321) | Pixel 7·iPhone 15(WebKit)·데스크톱·가짜 앱, 웹 3320/API 4320 |
| 모바일 | unit·UI                  | 앱 설정·상태 API(4331)                    | Android/iOS 가짜 WebView와 실제 웹, 웹 3330/API 4330         |
| bridge | 자체 Vitest              | 없음                                      | 없음                                                         |

```sh
corepack yarn workspace @side/photo-contest check
corepack yarn workspace @photo-contest/web lint
corepack yarn workspace @photo-contest/mobile lint
corepack yarn workspace @side/photo-contest test:api
corepack yarn workspace @photo-contest/web exec playwright install chromium webkit
corepack yarn workspace @side/photo-contest test:e2e
corepack yarn workspace @photo-contest/test-kit check:cleanup
corepack yarn build:photo-contest
corepack yarn format:check
```

모든 DB 레인은 `TEST_DATABASE_URL`을 우선 사용하고, 비어 있으면 로컬 `DATABASE_URL`만 허용합니다. 격리 스키마에 마이그레이션을 적용하고 종료 시 스키마·사진 폴더를 제거합니다. 검증용 API는 `.e2e-build`, Next는 `.next/e2e`·`.next/e2e-mobile`을 써 개발 서버와 겹치지 않습니다.

`/testing/users`(사용자+세션), `/testing/contests/:id/phase`(단계 이동), `/testing/app-login-tickets`(외부 성공 콜백 대체)은 `NODE_ENV=test`와 `ENABLE_TEST_API=true`에서만 열립니다. 개발·운영에서 활성화하면 서버가 시작을 거부합니다. 테스트 하네스가 설정하므로 개발 `.env`에서 켤 필요가 없습니다. 웹·모바일의 테스트 데이터는 이 API와 제품 API로 준비합니다.

보고서·trace는 각 앱의 `playwright-report`·`test-results`, 화면 캡처는 웹 앱의 `.data/screens`에 남습니다. CI는 앱별 레인과 WebKit 설치·테스트 DB·종료 후 정리 검사를 실행합니다.

실제 네이티브 빌드·실기기의 키보드/갤러리/시스템 공유 시트와 외부 OAuth는 브라우저 테스트로 대체되지 않습니다. 제품 가설·베타 사용자 모집은 [기획](docs/product-plan.md), 코드와 검증 결과는 [구현 기록](docs/implementation.md)을 참고하세요.
