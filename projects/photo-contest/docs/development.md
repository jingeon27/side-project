# 피식 개발 가이드

[프로젝트 안내](../README.md) · [기능 안내](features.md)

로컬 실행·인증·S3·모바일·테스트를 위한 상세 안내입니다. 현재 운영은 [공통 EC2 배포](../../../deploy/shared-instance/README.md)를 사용하며 이전 단독 Compose는 회귀 검증용입니다.

## 실행

Node.js 24(`.nvmrc`)와 Yarn 4.17.0 CLI를 직접 설치해 사용합니다. 저장소 루트에서 실행하세요.

```sh
npm install --global @yarnpkg/cli-dist@4.17.0 --force
yarn install --immutable
cp projects/photo-contest/.env.example projects/photo-contest/.env
yarn workspace @side/photo-contest db:generate
yarn workspace @side/photo-contest codegen
yarn workspace @side/photo-contest db:local
```

별도 터미널에서 해당 개발 DB에 마이그레이션을 적용하고 서버를 시작합니다.

```sh
yarn workspace @side/photo-contest db:migrate
yarn dev:photo-contest
```

- 웹: http://localhost:3200
- API: http://127.0.0.1:4200, 브라우저에서는 같은 origin의 `/backend/*` 프록시로 호출
- 기본 로컬 DB: 55432. `LOCAL_POSTGRES_PORT`와 `DATABASE_URL`을 함께 바꿔 프로젝트별로 분리
- DB: 프로젝트 `.data/postgres`. 미디어는 로컬 디스크가 아니라 실제 S3에 저장합니다.

아이디·비밀번호로 가입하거나 익명으로 시작합니다. 소셜·개발 닉네임 로그인은 제공하지 않습니다. 다른 브라우저 프로필에서 친구 계정으로 초대 링크를 열어보세요.

## 서비스 정책

이용약관(`/terms`)과 개인정보 처리방침(`/privacy`)은 로그인 없이 읽을 수 있습니다. 로그인 화면·MY·데스크톱 메뉴에서 연결하며, 운영자 김진건과 문의처 contact@bambyul.com은 `apps/web/src/_pages/legal/@page/model/policy.ts`에서 관리합니다.

두 문서는 검토용 초안입니다. 계정·미디어·인증 정보의 처리는 현재 구현을 기준으로 설명합니다. 정식 공개 전 실제 호스팅·저장소·분석 서비스의 위탁·국외 이전, 문의·운영 이력·백업 보관 기간과 아동 개인정보 처리 기준을 확인해 확정해야 합니다. 작성 시 [개인정보보호위원회의 2026년 개인정보 처리방침 작성지침](https://pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS074&nttId=12021)을 참고했습니다.

## 모바일 앱

Expo Go 대신 dev client 또는 스토어 빌드를 사용합니다.

```sh
yarn workspace @photo-contest/mobile android
yarn workspace @photo-contest/mobile ios
yarn workspace @photo-contest/mobile start
yarn workspace @photo-contest/mobile bundle:check
```

`WEB_ORIGIN`을 웹 주소로 설정하고 Android 에뮬레이터에서는 `adb reverse tcp:3200 tcp:3200`을 사용합니다. 쿠키는 WebView가 보관합니다. 최소 버전 확인 실패는 시작을 막지 않습니다. 모바일도 프로젝트 루트 `.env`의 공개 Sentry·Amplitude 키를 사용합니다.

## 인증·저장소·모니터링

로그인 화면에서 직접 정한 아이디·비밀번호로 회원가입하거나 로그인할 수 있습니다. 아이디는 영문·숫자·밑줄 3~24자로 대소문자를 구분하지 않으며, 가입 비밀번호는 8~128자입니다. 서버는 임의 salt를 쓴 scrypt 해시만 저장하고 기존 HttpOnly 세션 쿠키를 발급합니다. 반복 시도는 DB에서 제한합니다.

현재 제품은 아이디·비밀번호와 익명 세션으로 이용하며 소셜 로그인 설정은 필요하지 않습니다. 로컬·운영 환경변수 예제와 배포 컨테이너에서도 소셜 제공자 키를 요구하지 않습니다. `.env` 변경은 다음 개발 서버 시작 때 반영됩니다.

운영은 `NODE_ENV=production`, HTTPS `WEB_ORIGIN`, `DATABASE_URL`, private S3 호환 버킷(`S3_BUCKET`과 자격 증명)이 필요합니다. 버킷 CORS에 웹 origin의 POST를 허용합니다. 별도 컨테이너에서 API를 실행하면 `API_HOST`를 명시하고 웹 프록시를 통해 접근하게 구성합니다.

모든 사진·동영상은 S3 presigned URL로만 오갑니다. 웹 게시물은 requestPostUpload → 저장소 FormData POST → completePostUpload → createPost, 기존 대회 제출은 requestUploadUrl → POST → completeSubmissionUpload → createSubmission, 그룹 대표 사진은 requestGroupAvatarUpload → POST → completeGroupAvatarUpload → updateGroupProfile 순서이며 저장소에 세션 쿠키를 보내지 않습니다. POST 정책이 최종 키·형식·정확한 크기를 고정하고 완료는 HEAD로 확인합니다. API는 파일을 받거나 읽거나 변환·중계하지 않으며 메타데이터도 제거하지 않으므로 공개 전에 확인해야 합니다. 게시물·대회 사진·대표 사진의 고정 경로는 매 요청 권한을 확인하고 `private, no-store` 307로 60초 서명 GET에 보냅니다. 서버 HTML·공개 캐시에는 만료되는 주소 대신 고정 경로만 남습니다. 실제 S3 객체·CORS·IAM 검증은 운영 환경에서 별도로 진행합니다.

로컬 개발과 통합·브라우저 테스트도 `.env`의 실제 AWS S3 버킷을 사용합니다. `S3_ENDPOINT`는 비우고 버킷·리전·자격 증명을 설정합니다. 별도 S3 서버나 테스트 버킷은 만들지 않습니다. 테스트는 `<S3_KEY_PREFIX>/tests/<실행 ID>/` 경로만 사용하고 종료 시 그 객체만 지웁니다. 단위 테스트는 AWS에 접속하지 않습니다. 필요한 권한·CORS·CI 설정은 [첨부·저장 안내](post-attachments.md#검증)를 따릅니다. 기존 `.data/s3` 파일과 실제 버킷의 기존 데이터는 자동 삭제하거나 이행하지 않습니다.

| 앱     | 오류 수집                                               | 사용자 행동 측정                |
| ------ | ------------------------------------------------------- | ------------------------------- |
| API    | `SENTRY_DSN`, 내부 GraphQL 오류·REST 5xx·주기 작업 실패 | 도메인 이벤트를 DB에만 기록     |
| 웹     | `NEXT_PUBLIC_SENTRY_DSN`, 서버는 `SENTRY_DSN` 우선      | `NEXT_PUBLIC_AMPLITUDE_API_KEY` |
| 모바일 | `NEXT_PUBLIC_SENTRY_DSN`                                | `NEXT_PUBLIC_AMPLITUDE_API_KEY` |

API Sentry의 실제 수집 확인은 `yarn workspace @side/photo-contest sentry:check`로 한다. 설정한 DSN으로 확인용 이벤트 1건을 보내고 2xx 응답과 eventId를 출력한다. Sentry에서 `verification:configuration-check`, `service:photo-contest` 태그로 찾는다. 브라우저 키는 개발 서버 재시작 또는 운영 웹 재빌드가 필요하다. 웹의 실제 전송·개인정보 제거 검사는 `yarn workspace @photo-contest/web monitoring:check`로 실행한다([모니터링 안내](observability.md)). [부하테스트 예제와 지표](load-testing.md)도 참고한다.

GraphQL IDE는 제공하지 않고 운영에서는 introspection과 오류 stacktrace도 차단한다. 개발에서만 스키마 조회를 허용하며 API의 운영 모드 HTTP 통합 테스트로 확인한다.

키가 없으면 전송하지 않습니다. 요청·쿠키·사용자 정보를 제거하고 분석 속성에 닉네임·설명·초대 토큰을 넣지 않습니다. 앱과 웹은 브리지의 기기 ID로 분석 사용자를 연결합니다. 실제 Sentry·Amplitude 프로젝트 수신은 별도 확인이 필요합니다.

공용 ESLint 설정은 저장소 `packages/config/eslint`에 있습니다. `yarn workspace @side/config check`로 else·컴포넌트 fetch·오버레이 상태 금지와 FSD·인라인 핸들러 규칙의 RuleTester fixture를 검증합니다.

## 앱별 테스트

로컬에서는 별도 터미널에서 테스트 DB를 시작합니다. `db:test:local`은 `.data/test-postgres`·55434·`photo_contest_test`를 사용해 개발 DB와 분리합니다. 포트를 바꾸면 `.env`의 `LOCAL_TEST_POSTGRES_PORT`와 `TEST_DATABASE_URL`도 함께 바꾸세요.

```sh
yarn workspace @side/photo-contest db:test:local
```

| 앱     | `test`                     | `test:api`                                | `test:e2e`                                                                                                                |
| ------ | -------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| API    | 순수 규칙·저장소 서명 unit | 없음                                      | `test:integration`: Vitest + supertest + 실제 PostgreSQL, 구현 옆 `*.integration.{spec,test}.ts` (`test:e2e`는 호환 이름) |
| 웹     | unit·실제 폼/캐시 UI       | 생성 GraphQL 문서를 격리 API에 실행(4321) | Pixel 7·iPhone 15(WebKit)·데스크톱·가짜 앱, 웹 3320/API 4320                                                              |
| 모바일 | unit·UI                    | 앱 설정·상태 API(4331)                    | Android/iOS 가짜 WebView와 실제 웹, 웹 3330/API 4330                                                                      |
| bridge | 자체 Vitest                | 없음                                      | 없음                                                                                                                      |

```sh
yarn workspace @side/photo-contest check
yarn workspace @photo-contest/web lint
yarn workspace @photo-contest/mobile lint
yarn workspace @photo-contest/api test:integration
yarn workspace @side/photo-contest test:api
yarn workspace @photo-contest/web exec playwright install chromium webkit
yarn workspace @side/photo-contest test:e2e
yarn workspace @photo-contest/web test:cache
yarn workspace @photo-contest/test-kit check:cleanup
yarn build:photo-contest
yarn format:check
```

모든 DB 레인은 `TEST_DATABASE_URL`만 사용합니다. loopback·전용 포트(`LOCAL_TEST_POSTGRES_PORT`, 기본 55434)·`photo_contest_test`가 아니면 거부하고 개발 DB로 대신하지 않습니다. 격리 스키마에 마이그레이션을 적용하고 종료 시 스키마·사진 폴더를 제거합니다. 웹 브라우저 E2E는 실제 production build/standalone 서버를 실행합니다. 검증용 API는 `.e2e-build`, Next는 `.next/e2e`·`.next/e2e-mobile`을 써 개발 서버와 겹치지 않습니다.

/testing/users와 /testing/contests/:id/phase는 격리 실행기가 createApp({ testFixtures: true })로 등록할 때만 열립니다. NODE_ENV=test만 설정한 일반 서버에는 없습니다. 테스트 밖에서 등록하면 시작을 거부합니다.

보고서·trace는 각 앱의 `playwright-report`·`test-results`, 화면 캡처는 웹 앱의 `.data/screens`에 남습니다. CI는 앱별 레인과 WebKit 설치·테스트 DB·종료 후 정리 검사를 실행합니다.

공개 그룹·대회 목록·대회 상세·명예의 전당에는 canonical·OG/Twitter·JSON-LD와 서버 HTML을 제공합니다. 사이트맵에는 공개 그룹과 공개 대회만 포함하고 비공개 대회는 로그인한 그룹장에게도 noindex·구조화 데이터 제외를 적용합니다. 도메인 설정과 검증 방법은 [SEO 안내](seo.md)를 참고하세요.

실제 네이티브 빌드·실기기의 키보드/그룹/시스템 공유 시트는 브라우저 테스트로 대체되지 않습니다. 제품 가설·베타 사용자 모집은 [기획](product-plan.md), 코드와 검증 결과는 [구현 기록](implementation.md)을 참고하세요.

새 기능 사양은 단위·통합 모두 `.spec.ts(x)`를 사용합니다. 기존 API `test:e2e` 명령은 `test:integration`에 위임하는 호환 이름입니다. 이번 변경은 `20261020010000_group_contests` 마이그레이션을 포함하며 기존 Contest는 LEGACY, 일반 Post는 contestId=null로 보존합니다.

공개 SEO 콘텐츠는 Next Data Cache에서 30초, 사이트맵 데이터는 60초 주기로 재검증하며 웹의 쓰기 성공 뒤 즉시 만료시킵니다. 공개 여부·대회 일정과 로그인 사용자별 조회는 매번 확인합니다. 운영 Caddy의 GraphQL 경로도 Web을 거쳐야 하므로 [배포 안내](deployment.md)에 따라 프록시 설정을 함께 갱신합니다. 실제 standalone 캐시 검증은 앱의 test:cache가 소유합니다.

댓글 좋아요의 `20261022120000_post_comment_likes` 마이그레이션은 기존 댓글을 보존하고 관계 테이블만 추가합니다. 개발 환경에서는 `yarn workspace @side/photo-contest db:migrate`를 적용한 뒤 API·웹을 재시작합니다. 테스트는 격리 스키마에 적용하며 개발 DB에는 자동으로 적용하지 않습니다.

게시물의 관리 동작은 카드 오른쪽 `⋯` 메뉴에 모았습니다. 작성자·관리자는 제목·내용·카테고리를 수정하거나 삭제하며, 관리자만 숨길 수 있습니다. 숨긴 게시물 관리에서 다시 공개할 수 있습니다. 미디어·대회 참여와 작성자는 수정 시 유지됩니다.

댓글에는 한 단계 답글을 달 수 있습니다. 원댓글은 최신순, 펼친 답글은 오래된 순으로 각각 페이지를 나누며 답글에도 좋아요·취소와 작성자·관리자 삭제를 제공합니다. 원댓글을 지우면 답글과 연결된 좋아요도 함께 삭제되므로 확인창에서 안내합니다. `postCommentCount(postId, parentId)`는 해당 목록의 개수, 게시물의 `commentCount`는 답글을 포함한 전체 개수입니다. Apollo는 `postId`와 `parentId`별로 목록을 분리합니다.

`20261022130000_post_comment_replies`는 nullable parentId와 같은 게시물 안의 댓글을 참조하는 복합 FK를 추가합니다. 기존 댓글은 원댓글로 유지합니다. 개발 DB는 앞서 안내한 `db:migrate`로 적용하며 테스트는 격리 스키마에서 확인합니다.

### Prisma 7

Prisma CLI·Client·PostgreSQL 어댑터는 7.10.1로 맞춘다. 앱의 `prisma.config.ts`가 프로젝트 `.env`를 명시적으로 읽고 CLI 연결 URL을 전달한다. `db:generate`는 DB URL 없이 실행할 수 있으며 `db push`는 Client를 자동 생성하지 않는다.

기존 CommonJS 빌드·운영 스크립트·생성 경로와 호환되도록 `prisma-client-js` 생성기를 유지한다. 런타임은 `createPrismaAdapter`를 통해 Rust 쿼리 엔진 없이 pg를 사용한다. URL의 `schema`는 ORM과 raw SQL 양쪽에, `connection_limit`은 pg 풀의 최대 연결 수에 전달한다. pg는 풀 대기와 연결에 같은 timeout을 쓰므로 `pool_timeout`을 우선하고 없으면 `connect_timeout`(기본 5초)을 쓴다. 운영 URL의 `sslcert`는 서버 CA로 읽고 인증서 검증을 유지한다. Serializable 커밋에서 어댑터가 직접 던지는 `TransactionWriteConflict`도 `P2034`와 같은 재시도 한도로 처리한다.
