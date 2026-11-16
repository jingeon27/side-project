# 공통 EC2 검증 이력

[현재 운영 절차](../README.md)

기존 로컬 검증 명령과 과거 단독 구성·실행 결과를 보존한 기록입니다. 기록 당시의 성공 범위이며 현재 운영의 설정·수신·배포 성공을 보장하지 않습니다. 최신 실행 명령은 각 프로젝트 README와 개발 가이드, 최신 배포는 Actions 결과를 확인합니다.

## 로컬 검증 범위와 이전 구성

로컬에서는 Node.js 24와 저장소의 Yarn을 사용한다. 기존 개발 서버·개발 DB를 대상으로 테스트하지 않는다. 최초 설치는 `yarn install --immutable`, 브라우저 준비는 각 앱 workspace에서 `exec playwright install chromium webkit`으로 수행한다. 운영 DB·S3·OAuth 키는 로컬 테스트에 넣지 않는다.

공통 UI 검증은 `yarn workspace @side/design-system check`로 실행한다. 두 서비스의 UI가 함께 사용하는 lint·타입 검사·primitive 테스트를 확인한다.

GF는 자체 55444 테스트 DB와 임의 `gf_test_` 스키마를 사용한다. 다른 서비스용 `TEST_DATABASE_URL`을 설정하지 않은 터미널에서 순서대로 실행한다.

```sh
yarn workspace @side/game-feedback check
yarn workspace @side/game-feedback test
yarn workspace @side/game-feedback test:e2e
yarn workspace @side/game-feedback db:test:stop
```

PC는 별도 터미널에서 `yarn workspace @side/photo-contest db:test:local`로 전용 55434 DB를 시작한다. 다음 명령은 **PC 검증용 터미널에서만** 실행하고, 마치면 DB 터미널에서 Ctrl+C로 해당 DB만 종료한다. 앱별 임의 스키마는 테스트 teardown이 정리한다. API 빌드는 Docker 또는 test-kit의 `.e2e-build`에서 수행하므로 실행 중인 개발 서버의 `dist`를 바꾸지 않는다.

```sh
export TEST_DATABASE_URL='postgresql://contest:contest@127.0.0.1:55434/photo_contest_test?schema=public'
yarn workspace @side/photo-contest db:generate
yarn workspace @side/photo-contest lint
yarn workspace @side/photo-contest typecheck
yarn workspace @side/photo-contest test
yarn workspace @photo-contest/api test:e2e
yarn workspace @photo-contest/web test:api
yarn workspace @photo-contest/web test:e2e
yarn workspace @photo-contest/test-kit check:cleanup
```

공통 배포 검증은 Docker Engine/Compose와 amd64 실행 지원이 필요하다. macOS에서는 [Docker Desktop 설치](https://docs.docker.com/desktop/setup/install/mac-install/) 또는 [Colima 설치](https://github.com/abiosoft/colima#installation) 중 하나로 별도 검증 환경을 준비한다. 작업할 Docker context를 확인한 뒤 저장소 루트의 **Bash**에서 아래 명령을 실행한다. `test:e2e`의 개발 서버 검증과 별개로 실제 운영 Dockerfile의 이미지 4개를 빌드한다.

```bash
deployment_test_sha="$(git rev-parse HEAD)"
deployment_image_labels=(
  --label org.opencontainers.image.source=https://github.com/jingeon27/side-project
  --label "org.opencontainers.image.revision=$deployment_test_sha"
)
docker build --platform linux/amd64 "${deployment_image_labels[@]}" \
  -f projects/game-feedback/deploy/shared-instance/Dockerfile --target api \
  -t "side-shared-gf-api:$deployment_test_sha" .
docker build --platform linux/amd64 "${deployment_image_labels[@]}" \
  -f projects/game-feedback/deploy/shared-instance/Dockerfile --target web \
  --build-arg WEB_ORIGIN=https://game-feedback.test \
  --build-arg GAME_FEEDBACK_CONTACT_EMAIL=contact@bambyul.com \
  -t "side-shared-gf-web:$deployment_test_sha" .
docker build --platform linux/amd64 "${deployment_image_labels[@]}" \
  -f projects/photo-contest/apps/api/Dockerfile \
  -t "side-shared-pc-api:$deployment_test_sha" .
docker build --platform linux/amd64 "${deployment_image_labels[@]}" \
  -f projects/photo-contest/apps/web/Dockerfile \
  --build-arg WEB_ORIGIN=https://photo-contest.test \
  -t "side-shared-pc-web:$deployment_test_sha" .
```

Linux 호스트에 `flock` 등 위 운영 도구가 있으면 `SIDE_SMOKE_TAG="$deployment_test_sha" node projects/game-feedback/apps/api/scripts/shared-instance-smoke.ts`로 실행한다. macOS에는 Linux `flock`이 없으므로 Dockerfile의 기존 `smoke-tools` stage를 사용한다. Colima의 Linux Docker VM에서는 아래 host network로 검증할 수 있다. Docker Desktop은 [host networking 지원 설정](https://docs.docker.com/engine/network/drivers/host/#docker-desktop)을 먼저 활성화해야 한다. 이 도구 컨테이너는 테스트 중 Docker socket을 사용하며 운영 서비스로 배포하지 않는다.

```bash
deployment_test_root="$(pwd)"
docker build -f projects/game-feedback/deploy/shared-instance/Dockerfile \
  --target smoke-tools -t "side-shared-smoke-tools:$deployment_test_sha" .
docker run --rm --network host \
  --volume /var/run/docker.sock:/var/run/docker.sock \
  --volume "$deployment_test_root:$deployment_test_root" \
  --workdir "$deployment_test_root" \
  --env "SIDE_SMOKE_TAG=$deployment_test_sha" \
  "side-shared-smoke-tools:$deployment_test_sha" \
  projects/game-feedback/apps/api/scripts/shared-instance-smoke.ts
```

성공 기준은 마지막 `Shared-instance smoke passed` 출력이다. runner는 임의 Docker project/network/volume과 loopback의 임의 포트를 사용하고 종료 시 자신이 만든 테스트 자원을 정리한다. 빌드 이미지와 Docker VM의 정리는 검증자가 소유한 것만 대상으로 한다. 전역 prune, 기존 서비스 중지, 기존 volume 삭제는 하지 않는다.

API 소유 통합 runner `projects/game-feedback/apps/api/scripts/shared-instance-smoke.ts`는 실제 두 API/Web 이미지·Caddy와 `prepare.sh`·`database.sh`로 띄운 공용 PostgreSQL 컨테이너를 실행한다. 미디어는 기존 AWS S3 버킷의 `<프로젝트 prefix>/tests/<실행 ID>/`에 직접 전송하며 S3 대역 컨테이너·인증서·DNS 별칭은 만들지 않는다. 업로드 전에 해당 prefix의 ListBucket 접근을 확인하고 종료 시 그 실행의 객체만 정리한다. backup 버킷 업로드와 registry 매핑은 계속 CLI fixture로 검사한다. 서비스 S3 폴더, DML/DDL 분리, Web의 DB 네트워크 차단, 배포 전 덤프와 업로드 실패 시 migration 차단, S3 파일/Range, 안전한 세션 쿠키, SSE 재연결, 한 서비스 실패 시 독립 롤백, 재시작 후 파일·DB 보존, liveness/readiness를 검사한다. 실제 운영 IAM 정책 변경·backup 버킷 전송·스냅샷을 검증했다는 뜻은 아니다. 필요한 실제 S3 키·CI Variables/Secrets·CORS·정리 권한은 [Game Feedback](../../../projects/game-feedback/docs/media-upload.md#기본-로컬-실행)과 [Photo Contest](../../../projects/photo-contest/docs/post-attachments.md#검증)의 테스트 설정을 따른다.

### 2026-10-20 로컬 실행 기록

애플리케이션 검증 기준은 develop의 `9f5d9afe68f929837e9f9466945bc7caf740122a`다. 아래 결과는 해당 날짜·기준 커밋의 과거 검증 기록이다. 최신 코드에서 재실행한 결과가 아니며 현재 배포 검증을 대신하지 않는다.

| 검증                       | 결과                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| 공통 디자인 시스템 `check` | lint/typecheck와 테스트 14개 통과                                                                |
| GF `check`                 | API/Web/Mobile/Admin와 패키지 타입 검사, 앱 lint 통과                                            |
| GF `test`                  | API 173, SDK 43, Web 102, Mobile 43, Admin 2개 통과                                              |
| GF Web E2E                 | 일반 브라우저 94, 테스트 토큰 로그인 3, 운영 prefetch 12개 통과                                  |
| GF Admin E2E               | 3개 통과                                                                                         |
| GF Mobile E2E              | Playwright의 Android/iOS native host fixture 34개 통과                                           |
| PC lint/typecheck          | 통과                                                                                             |
| PC `test`                  | API unit 86, Web 287, Mobile 137, Bridge 35개 통과                                               |
| PC API integration         | 실제 전용 PostgreSQL + Supertest 217개 통과                                                      |
| PC Web API                 | 실제 격리 API에 생성 문서 실행 11개 통과                                                         |
| PC Web E2E                 | mobile Chrome/Safari, desktop Chrome, WebView 총 42개 통과                                       |
| 운영 Docker 이미지         | GF API/Web, PC API/Web의 linux/amd64 이미지 4개 빌드 및 revision label 확인                      |
| 공통 배포 smoke            | `Shared-instance smoke passed` 확인. 실제 앱·TLS·저장/조회·SSE·롤백·재시작 보존·health 검사 통과 |

컨테이너 검증은 macOS의 별도 Colima profile과 기존 `smoke-tools` 컨테이너에서 실행했다. 검증이 만든 Docker container/network/volume을 정리하고 전용 VM도 삭제했다. PC 테스트 DB는 임시 디렉터리·임의 비밀번호를 사용하는 별도 55434 인스턴스에서 실행한 뒤 종료·정리했고, GF 소유 55444 테스트 DB도 종료했다. 기존 GF 개발 서버/API와 55442 개발 DB를 재시작하지 않았다.

실제 AWS 리소스 생성, 운영 IAM 권한, EBS 스냅샷·덤프의 실제 복원, 공인 DNS/인증서, 외부 OAuth 제공자의 로그인과 실제 운영 SSH 전송은 이번 로컬 실행 범위에 포함되지 않는다. 위 최초 배포 절차에서 계정 소유자가 리소스를 준비한 뒤 확인해야 한다.

`projects/photo-contest/deploy/compose.yaml`은 별도 컨테이너 회귀 테스트용이다. Actions CD는 이 문서의 shared-instance 구성과 `projects/game-feedback/deploy/shared-instance/Dockerfile`을 사용한다.

Photo Contest의 `/backend/graphql`은 pc-web의 Next Route Handler로 보내 공개 SEO·사이트맵 캐시 무효화를 수행한다. 나머지 `/backend/*`는 pc-api로 보낸다. Caddyfile이 바뀐 릴리스는 [공용 Caddyfile 동기화](../README.md#공용-caddyfile-동기화)로 반영한다. PC route 블록의 내부 경로 차단·GraphQL·일반 API·Web 순서를 유지한다.
