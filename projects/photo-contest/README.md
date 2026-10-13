# 웃긴순간

친구들과 비공개 그룹을 만들고 사진 한 장씩 제출한 뒤, 한 표로 우승작을 뽑는 사진 대회 MVP.
기획 원본은 `docs/product-plan.md`.

## 로컬 실행

Node.js **22.12 이상**(검증: 24.19)과 Corepack/Yarn 4.17이 필요합니다.
기존 시스템 Node 18에서는 Next.js를 실행할 수 없습니다.

```sh
cd side
# 저장소 루트에서 의존성을 설치합니다.
corepack enable
corepack yarn install
cp projects/photo-contest/.env.example projects/photo-contest/.env
corepack yarn workspace @side/photo-contest db:generate
corepack yarn workspace @side/photo-contest codegen
```

터미널 1에서 개발 PostgreSQL을 실행합니다. 다른 프로젝트의 DB를 사용하거나 초기화하지 않습니다.

```sh
corepack yarn workspace @side/photo-contest db:local
# 또는: docker compose -f projects/photo-contest/docker-compose.yml up -d postgres
```

터미널 2에서 마이그레이션을 적용하고 두 앱을 실행합니다.

```sh
corepack yarn workspace @side/photo-contest db:migrate
corepack yarn dev:photo-contest
```

- 웹: **http://localhost:3200**
- GraphQL API: http://127.0.0.1:4200/graphql (브라우저에서는 `/backend/graphql` 프록시 사용)
- 로컬 DB: 127.0.0.1:55432, 개발 데이터는 `projects/photo-contest/.data/postgres`
- 로컬 사진: `projects/photo-contest/.data/photos`

`NODE_ENV=development`와 `ENABLE_DEV_LOGIN=true`인 경우에만 닉네임으로 체험할 수 있습니다.
닉네임이 같으면 같은 개발 계정입니다. 별도의 브라우저 프로필/시크릿 창에서 다른 닉네임으로 친구 계정을 만들고,
관리자의 초대 링크로 그룹에 가입하세요. 운영에서는 개발 로그인이 차단됩니다.

## 구현된 기능

- 카카오·Google OAuth Authorization Code + state/PKCE, HttpOnly 세션, 로그아웃
- 그룹 생성·초대 링크·가입·멤버 목록, 관리자와 일반 멤버의 권한 분리
- 대회 생성, 서버 시계 기준 제출/투표/종료 자동 전환
- 1인 1장 사진 제출, 실제 파일 포맷 검사, 40MP/10MB 제한, WebP 변환·메타데이터 제거
- 비공개 사진 조회, 24장 단위 페이지네이션, 이미지 지연 로딩
- 자기 사진/숨긴 사진 투표 금지, 1인 1표 DB unique + Serializable 트랜잭션
- Apollo 정규화 캐시, 투표 낙관적 업데이트와 실패 롤백
- 종료 전 득표수 비공개, 공동 우승, 결과와 지난 대회 기록
- 사진 신고, 관리자 신고 내용 확인·숨김·삭제
- 반응형 화면, 폼 검증, 로딩·빈 화면·실패 상태, 키보드로 사용하는 다이얼로그
- 제품 이벤트 DB outbox, 선택적 Amplitude 전송, 선택적 Sentry 오류 수집
- 만료된 세션·OAuth 요청·미제출 사진 정리

`app`은 라우팅, `_pages`는 화면, `features`는 도메인 작업, `shared`는 기반 코드를 담당합니다.
계획의 pnpm/Radix 대신 현재 저장소 규칙에 맞춰 **Yarn/Base UI**를 사용합니다.

## 인증과 운영 환경

`projects/photo-contest/.env.example`에 필요한 변수가 있습니다. OAuth 앱에 아래 callback을 정확히 등록하세요.

```text
https://YOUR_WEB_DOMAIN/backend/auth/google/callback
https://YOUR_WEB_DOMAIN/backend/auth/kakao/callback
```

로컬이면 `http://localhost:3200`을 사용합니다. Google은 client ID/secret,
카카오는 REST API 키와 앱에서 활성화한 client secret을 설정합니다.
OAuth 구현은 provider 응답을 대체한 경계 테스트를 포함하며, **실제 provider 계정 인증은 별도 설정 후 검증해야 합니다**.
카카오 설정은 [공식 REST API 문서](https://developers.kakao.com/docs/ko/kakaologin/rest-api)를 참고하세요.

운영에서는 `NODE_ENV=production`, HTTPS `WEB_ORIGIN`, `DATABASE_URL`, 영속 사진 저장소가 필요합니다.
API는 127.0.0.1에 바인딩됩니다. 서로 다른 컨테이너로 배포할 경우 명시적으로 `API_HOST`를 설정하고,
웹 프록시에서만 API에 접근하도록 네트워크를 구성하세요. 브라우저 요청은 웹과 같은 origin을 사용합니다.

```sh
corepack yarn workspace @side/photo-contest db:generate
corepack yarn workspace @side/photo-contest codegen
corepack yarn workspace @side/photo-contest db:migrate
corepack yarn build:photo-contest
# API와 웹은 각각 해당 workspace의 start 스크립트로 실행
```

SSR에서 인증 Cookie는 서버 안에서만 GraphQL 요청으로 전달됩니다.
브라우저로 직렬화하는 데이터와 공유 캐시에 세션 원문을 넣지 않습니다.
계정 변경 시 문서 전체를 다시 로드하여 Apollo 캐시를 폐기합니다.

## 사진 저장소

기본 `STORAGE_BACKEND=local`은 private 디렉터리를 사용합니다. 운영에서는 이 경로에 영속 볼륨이 필요합니다.
`STORAGE_BACKEND=s3`이면 S3/R2/MinIO 호환 **private 버킷**을 사용합니다.
`S3_BUCKET`, `S3_REGION`, 선택적 `S3_ENDPOINT`, AWS credentials를 설정하세요.
버킷의 공개 읽기는 비활성화하고 API 계정에 해당 버킷의 Get/Put/DeleteObject 권한만 부여합니다.

브라우저는 짧게 유효한 일회용 업로드 URL로 **API에 직접** 파일을 전송합니다.
API가 사진을 검증·변환한 다음 저장하며, 파일 읽기도 매번 그룹 멤버십을 검사합니다.
기획의 S3 presigned URL로 원본을 직접 올리는 방식은 채택하지 않았습니다.
작은 베타에서는 검증되지 않은 원본을 외부 저장소에 올리지 않는 구조가 간단하기 때문입니다.
S3 구현은 어댑터를 제공하지만 실제 버킷 credentials로 검증하지 않았습니다.

숨김은 관리자가 다시 볼 수 있게 보관하고, 삭제는 제출·연결 투표·신고를 제거한 뒤 파일을 제거합니다.
파일 제거에 실패하거나 업로드가 중단된 경우 백그라운드 작업이 정리를 재시도합니다.

## 관측

`AnalyticsEvent`는 성공한 변경과 같은 DB 트랜잭션에서 기록합니다.
`group_created`, `group_joined`, `contest_created`, `submission_created`, `vote_cast`,
`contest_completed`, `result_viewed`, `next_contest_joined`를 지원합니다.
결과 조회는 사용자/대회당 최초 1회, 다음 대회 재참여는 이전 종료 대회에 제출한 사용자의 새 제출로 정의합니다.
종료 이벤트는 약 1분 이내에 생성하며 `participants >= 3`인 대회를 `activeContest=true`로 기록합니다.

`AMPLITUDE_API_KEY`가 비어 있으면 이벤트는 DB에만 남습니다.
설정하면 1분마다 미전송 이벤트를 전달하고, 실패 시 다음 주기에 재시도합니다.
`insert_id`로 중복 전달을 식별합니다. EU 프로젝트이면 `AMPLITUDE_REGION=EU`.
사진, 설명, 닉네임, 이메일은 전송하지 않습니다.

`SENTRY_DSN`은 API, `NEXT_PUBLIC_SENTRY_DSN`은 웹 오류 수집을 활성화합니다.
사용자·Cookie·요청 본문·breadcrumb 수집을 끄고 오류만 보냅니다. 웹 DSN은 빌드 시 설정해야 합니다.
키 없는 로컬에서는 외부 서비스에 전송하지 않습니다. 실제 프로젝트 대시보드에서 수신 확인은 별도입니다.

## 검증

```sh
corepack yarn workspace @side/photo-contest check                 # ESLint + TypeScript + unit/UI
corepack yarn format:check
corepack yarn build:photo-contest
DATABASE_URL='postgresql://contest:contest@127.0.0.1:55432/photo_contest?schema=public' corepack yarn test:photo-contest:integration
corepack yarn workspace @photo-contest/e2e install:browser
corepack yarn test:photo-contest:e2e               # .env의 개발 DATABASE_URL 사용
```

통합/E2E 테스트는 지정된 DB에 임의 이름의 **격리 스키마**를 만들고 종료 시 그 스키마만 제거합니다.
운영 DB에 실행하지 마세요. E2E는 별도 포트 **3320/4320**으로 두 앱을 띄웁니다.
기존 서버를 재사용하거나 중지하지 않습니다. Playwright 결과는 `projects/photo-contest/e2e/playwright-report/`, 화면 캡처는 해당 워크스페이스의 `.data/`.
CI 정의는 `.github/workflows/photo-contest.yml`이며 독립 저장소로 가져올 때 사용할 수 있습니다.
`side`는 자체 Git 저장소이며 `origin`은 `https://github.com/jingeon27/side.git`입니다.

## 베타 출시 후 할 일

배포 계정·OAuth 앱·S3 버킷·관측 프로젝트 설정과 실제 로그인 확인이 필요합니다.
5개 그룹 모집, 2회 대회 운영, 인터뷰, 퍼널 분석, 개선 전후 성능 측정은 실제 사용자와 진행할 단계입니다.
결과 공유 카드·댓글·알림·공개 그룹은 기획대로 MVP 범위에서 제외했습니다.
제품 실험과 정책 결정은 [구현 기록](docs/implementation.md)에 정리했습니다.

## 테스트 소유권

- API unit: `apps/api/src/**/*.spec.ts`, 설정 `apps/api/vitest.config.mts`
- API integration: `apps/api/test/integration`, 설정 `apps/api/vitest.integration.config.mts`
- 웹 unit/UI: `apps/web/src/**/*.spec.ts(x)`, 설정 `apps/web/vitest.config.mts`
- E2E: `e2e/tests`, 설정 `e2e/playwright.config.ts`

Vitest와 Playwright 의존성은 각각 위 워크스페이스에 선언합니다. 저장소 루트에는 테스트 파일이나 러너 설정을 두지 않습니다.

로컬 `.env`에서 `LOCAL_POSTGRES_PORT`와 `DATABASE_URL`을 함께 바꾸면 DB 포트를 분리할 수 있습니다. 현재 이전한 개발 DB는 55433을 사용합니다.
