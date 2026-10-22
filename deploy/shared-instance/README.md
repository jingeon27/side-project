# 공통 EC2 배포

Photo Contest와 Game Feedback을 서울 리전의 **EC2 한 대 + 외부 RDS PostgreSQL 한 인스턴스 + 서비스별 비공개 S3 버킷**으로 운영한다. 두 서비스의 API 프로토콜은 각각 GraphQL과 REST를 유지한다. 운영 이미지는 모두 `linux/amd64`다.

```text
game.bambyul.com         ─┐              ┌─ GF Web
api.game.bambyul.com     ─┤              ├─ GF API ─ game_feedback DB / GF S3
                         ├─ Caddy :443 ─┤
contest.bambyul.com      ─┤              ├─ PC Web
api.contest.bambyul.com  ─┘              └─ PC API ─ photo_contest DB / PC S3
```

제품명은 Game Mate와 별사대(별난 사진 대회)다. 밤별 블로그는 `blog.bambyul.com`에서 별도 Vercel 프로젝트로 운영한다. `api.blog.bambyul.com`은 주소만 예약하며 현재 별도 API 서버는 없다.

웹·WebView의 세션은 기존 웹 호스트의 host-only 쿠키를 유지한다. 브라우저는 같은 origin의 `/api`·`/backend`를 사용한다. 공개 API 호스트에서도 내부·관리자·테스트 경로는 막고, 별사대 `/graphql`은 PC Web의 `/backend/graphql`로 전달하여 mutation 후 Next 캐시를 만료한다. PC Web의 `API_URL`은 `http://pc-api:4200` 같은 내부 API 주소를 유지해야 순환 프록시가 생기지 않는다. API 호스트에는 `X-Robots-Tag: noindex, nofollow`를 적용한다.

Caddy만 80/443을 공개한다. API·Web은 서비스별 Docker 네트워크를 사용하고 Caddy만 두 네트워크에 연결한다. GF API의 4300은 로컬 관리자 연결을 위해 EC2 loopback에만 바인딩한다. DB·원본 미디어는 EC2 볼륨에 저장하지 않는다. 이 구성은 EC2 장애 시 두 서비스가 함께 중단되는 구조다.

## AWS에서 먼저 준비할 것

1. 서울 리전에 x86_64 Linux EC2, 고정 공인 IP와 네 호스트의 DNS를 준비한다. Docker Engine 25 이상/Compose plugin 2.20.2 이상, Bash, Python 3, curl, OpenSSL, tar, `flock`이 필요하다. SSH는 운영자·배포 runner가 접속할 수 있도록 설정하고 앱 포트와 Docker API는 외부에 열지 않는다.
2. 같은 VPC의 **비공개 RDS PostgreSQL**을 만든다. 스토리지 암호화, 삭제 방지, 자동 백업 보존 기간 7일 이상을 설정한다. RDS 보안 그룹의 5432는 EC2 보안 그룹에서만 허용한다. `rds.force_ssl`을 활성화한 파라미터 그룹을 사용한다. 실제 RDS PostgreSQL 버전과 마이그레이션 호환성은 배포 전 별도 확인한다.
3. EC2 인스턴스 역할에 [RDS 조회 정책](rds-read-policy.json)을 붙인다. 배포 전 `DescribeDBInstances`로 복구 가능 시각을 확인한다. 이 역할에는 DB 비밀번호·S3 공통 쓰기 권한을 넣지 않는다. 컨테이너에서 IMDSv2로 인스턴스 역할을 읽으려면 EC2 metadata 응답 hop limit을 2로 설정한다.
4. 서울 리전에 서로 다른 S3 버킷 두 개를 만든다. [퍼블릭 접근 차단](s3-public-access.json), 기본 암호화, **Versioning**을 활성화한다. [수명 주기](s3-lifecycle.json)는 오래된 이전 버전과 미완료 multipart만 정리하며 현재 객체를 만료시키지 않는다. Game Feedback 게시글·채팅 첨부는 presigned POST로 직접 전송하므로 해당 버킷에 [CORS 예시](../../projects/game-feedback/deploy/shared-instance/s3-cors.json)의 origin을 실제 도메인으로 바꿔 적용한다. Photo Contest는 모든 사진·동영상을 presigned POST로 올리고 60초 presigned GET으로 읽으므로 해당 버킷에 [PC CORS](../../projects/photo-contest/deploy/shared-instance/s3-cors.json)의 실제 웹 origin(POST)을 적용한다. 수명 주기는 위 공통 규칙을 그대로 쓰며 staging 접두사 규칙은 필요 없다. 완료하지 않은 업로드는 API 정리 작업이 지운다. 버킷 공개 접근은 계속 차단한다. [Game Feedback 업로드와 조회 검증](../../projects/game-feedback/docs/media-upload.md), [Photo Contest 배포 순서](../../projects/photo-contest/docs/deployment.md)를 확인한다.
5. [S3 앱 정책](s3-app-policy.json)의 `SERVICE_BUCKET_NAME`을 각 버킷으로 바꾸고 서비스별 IAM 자격 증명을 발급한다. 각 계정은 자기 버킷만 읽고 쓸 수 있어야 한다. 한쪽 자격 증명으로 다른 버킷을 읽거나 쓰는 요청이 거부되는지 AWS에서 직접 확인한다. RDS 복구 지점 조회용 EC2 역할과 이 두 자격 증명을 구분한다.

상시 컨테이너 메모리 한도 합계는 약 2.7GiB이며 운영 도구·OS·업로드 처리에는 추가 메모리가 필요하다. 실제 인스턴스 크기와 RDS 연결 수는 업로드·동시 채팅·SSR 부하를 측정해 결정한다. 호스트에서 운영 이미지를 빌드하지 않는다.

## 호스트 파일과 DB 초기화

서버에 저장소를 체크아웃한 뒤 배포 사용자 소유 디렉터리를 준비한다. 다음 작업은 AWS 리소스를 생성하지 않는다.

```sh
sudo install -d -m 700 -o "$USER" -g "$(id -gn)" /srv/side-project
bash deploy/shared-instance/scripts/prepare.sh
```

다음 파일을 서버에서 편집한다. Git이나 Actions 로그에 실제 값을 올리지 않는다. Compose가 읽는 파일이므로 `source`하지 않는다.

| 파일                                            | 설정                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `/srv/side-project/.env`                        | 두 도메인, ACME 메일, RDS 실제 endpoint·instance ID, 두 버킷 이름   |
| `/srv/side-project/services/game-feedback/.env` | GF runtime/migrator DB URL, GF 버킷 자격 증명, OAuth·Supercell 설정 |
| `/srv/side-project/services/photo-contest/.env` | PC runtime/migrator DB URL, PC 버킷 자격 증명, 선택적 Sentry 설정   |

`prepare.sh`는 AWS 공식 [RDS CA 번들](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html)을 내려받아 `/srv/side-project/certs/rds-ca.pem`에 둔다. 이미 존재하는 환경변수 파일은 덮어쓰지 않는다. 프록시 파일은 현재 저장소 버전으로 복사하므로 변경 시 검토 후 `proxy.sh reload`를 실행한다.

새 RDS에만 관리자 계정으로 다음 SQL을 **한 번** 적용한다. 각 `\password` 프롬프트에 서로 다른 32자 이상의 비밀번호를 입력한다. `psql` 클라이언트가 필요하다. DB URL 비밀번호는 URL 인코딩한다.

```sh
PGSSLMODE=verify-full PGSSLROOTCERT=/srv/side-project/certs/rds-ca.pem \
  psql -h YOUR_RDS_ENDPOINT -U YOUR_RDS_ADMIN -d postgres -W \
  -v ON_ERROR_STOP=1 -f deploy/shared-instance/rds-bootstrap.sql
```

| 서비스        | Database        | 실행 중 DML 계정 | 일회성 DDL 계정          |
| ------------- | --------------- | ---------------- | ------------------------ |
| Game Feedback | `game_feedback` | `game_feedback`  | `game_feedback_migrator` |
| Photo Contest | `photo_contest` | `photo_contest`  | `photo_contest_migrator` |

각 DB의 PUBLIC 접속 권한을 회수하고 자기 서비스만 접속하도록 설정한다. runtime 계정은 schema 생성, role 생성, DB 생성, superuser 권한을 갖지 않는다. migration 실행 후 앱 테이블의 DML 권한을 부여하고 `_prisma_migrations` 접근은 회수한다. DDL 비밀번호는 일회성 migrate 컨테이너에만 전달한다. 관리자 DB URL을 runtime에 넣지 않는다.

Prisma 6 URL은 `sslmode=require&sslaccept=strict&sslcert=/run/rds/ca.pem`을 사용한다. [Prisma PostgreSQL TLS 옵션](https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql)은 `psql`의 `verify-full` 설정과 다르다. URL의 endpoint, DB, role, CA 경로, 연결·풀 대기 한도를 시작 시 검사한다. 각 API의 기본 풀은 5개이며 migrator는 2개다.

CA를 갱신하면 기존 bind mount가 이전 파일을 유지할 수 있으므로 API 컨테이너를 다시 생성한 뒤 TLS 연결을 확인한다. 인증서 회전은 기존 CA가 만료되기 전에 수행한다.

## 프록시와 GitHub Actions

도메인 DNS가 EC2를 가리키고 80/443이 열려 있는 상태에서 설정을 검증하고 프록시를 시작한다. API가 아직 실행되지 않았다면 프록시는 잠시 502를 돌려줄 수 있다.

```sh
bash deploy/shared-instance/scripts/proxy.sh validate
bash deploy/shared-instance/scripts/proxy.sh start
```

GitHub의 해당 배포 Environment(`production`, `photo-contest-production`) 또는 repository 설정에 다음을 등록한다. 기존 GitHub 연결을 다시 만들 필요는 없다.

| 종류                | 이름                                                               | 값                                                                                        |
| ------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Variable            | `SIDE_DEPLOY_HOST`                                                 | EC2 공인 IP 또는 SSH 호스트                                                               |
| Variable            | `SIDE_DEPLOY_SSH_USER`                                             | `/srv/side-project`와 Docker 접근 권한을 가진 사용자                                      |
| Variable            | `SIDE_DEPLOY_SSH_PORT`                                             | 보통 `22`                                                                                 |
| Variable            | `SIDE_DEPLOY_SSH_KNOWN_HOSTS`                                      | 신뢰할 경로로 확인한 서버 host key. 검증 없는 `ssh-keyscan` 결과를 그대로 신뢰하지 않는다 |
| Secret              | `SIDE_DEPLOY_SSH_KEY`                                              | 배포용 SSH private key                                                                    |
| Repository Variable | `GF_SITE_URL`                                                      | `https://game.bambyul.com`                                                                |
| Repository Variable | `GF_CONTACT_EMAIL`                                                 | `contact@bambyul.com`                                                                     |
| Repository Variable | `PHOTO_CONTEST_SITE_URL`                                           | `https://contest.bambyul.com`                                                             |
| Repository Variable | `PHOTO_CONTEST_DEPLOY_BRANCH`                                      | 운영 배포 브랜치, 예: `main`                                                              |
| Repository Variable | `PHOTO_CONTEST_WEB_SENTRY_DSN` / `PHOTO_CONTEST_AMPLITUDE_API_KEY` | 선택적 공개 Web 빌드 설정                                                                 |

공개 Web 빌드 변수는 재사용 workflow의 빌드 시 읽으므로 **repository variable**에 둔다. DB·S3·OAuth 비밀은 서버의 서비스별 환경 파일에만 둔다. GHCR은 Actions의 단기 `GITHUB_TOKEN`으로 로그인하며 서버에 토큰을 남기지 않는다.

설정과 복구 연습을 마친 뒤 `GF_DEPLOY_ENABLED=true`, `PHOTO_CONTEST_DEPLOY_ENABLED=true`를 repository variable로 설정한다. GF는 main push, PC는 설정한 브랜치 push에서만 배포한다. PR은 테스트만 실행한다. 기능 브랜치의 PR 대상 `develop`은 이 배포 브랜치 설정과 별개다.

Actions는 공통 환경에서 네 운영 이미지를 한 번 빌드·검증한 뒤 아카이브한다. 각 서비스의 추가 검사와 필수 테스트가 성공하면 **그 이미지**를 GHCR로 push하고 digest로 배포한다. 서비스 배포와 이미지 정리는 GitHub concurrency와 서버의 공통 `flock`으로 직렬화한다. 배포 순서는 runtime RDS/S3 접근 검사 → 최신 PITR 확인·기록 → migration → API/Web readiness → current/previous 갱신이다. 호스트의 공통 Caddy와 다른 서비스는 교체하지 않는다.

## 운영·롤백

각 릴리스에는 자기 버전의 운영 도구가 들어간다. 다음은 GF 예시이며 PC는 경로와 서비스 인자를 `photo-contest`로 바꾼다.

```sh
bash /srv/side-project/services/game-feedback/current/host/service.sh game-feedback status
bash /srv/side-project/services/game-feedback/current/host/service.sh game-feedback rollback
bash /srv/side-project/services/game-feedback/current/host/service.sh game-feedback prune
bash /srv/side-project/services/game-feedback/current/host/service.sh game-feedback operator grant USER_ID
bash /srv/side-project/services/game-feedback/current/host/service.sh game-feedback operator session USER_ID
```

`prune`은 GF의 고아 미디어 정리다. PC의 파일·세션 정리는 기존 scheduler가 담당한다. operator session 명령의 출력은 로그인 토큰이므로 공유 로그에 붙이지 않는다. GF 관리자 UI는 로컬에서 실행하고 SSH 터널(`ssh -L 4300:127.0.0.1:4300 ...`)로 API에 연결한다.

새 배포의 readiness가 실패하면 이전 API/Web 이미지로 복구한다. SQL은 되돌리지 않으므로 이전 앱과 호환되는 추가형 migration이 필요하다. 첫 배포 실패 시 그 서비스의 API/Web만 멈춘다. Caddy·외부 DB·S3는 유지한다. 여러 복제 API에 걸친 SSE 분배는 현재 범위에 포함하지 않으며 GF SSE는 프로세스 재시작 후 재연결한다.

오래된 이미지는 두 서비스가 모두 한 번 이상 성공한 뒤 아래 명령으로 정리한다. 네 서비스 이미지 저장소만 대상으로 하고 두 서비스의 current/previous digest, 최근 7일 이미지와 실행 중 컨테이너 이미지를 보존한다. 전역 `docker system prune`을 실행하지 않는다.

```sh
python3 /srv/side-project/services/game-feedback/current/host/prune-images.py
```

외부 모니터링은 GF `/api/health/ready`, PC `/backend/health/ready`를 확인한다. API `/health/live`(GF `/api/health/live`)와 각 Web `/_health/live`는 DB 장애에서도 프로세스 생존을 확인한다. 외부 readiness 모니터링과 알림 수신자를 별도로 등록해야 한다.

## 백업·복구 연습

배포 도구는 RDS의 `LatestRestorableTime`이 최근 20분 이내이고 암호화·비공개·삭제 방지·백업 보존 7일 이상인지 확인한다. 이 기록은 **공급자가 제공하는 복구 지점 확인**이며 DB 복원 연습을 대신하지 않는다. RDS 자동 백업의 [보존 기간](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.BackupRetention.html)은 생성 방법에 따라 기본값이 다르므로 명시적으로 설정한다.

1. 운영과 분리한 새 RDS 인스턴스로 원하는 시각의 PITR을 수행한다. 원래 DB를 덮어쓰지 않는다. [AWS PITR 안내](https://docs.aws.amazon.com/AmazonRDS/latest/gettingstartedguide/managing-backup-restore.html)를 따른다.
2. 별도 앱 환경에서 복원된 두 DB의 사용자·권한·게시물·댓글·채팅·첨부 참조가 맞는지 확인한다. DB 시점과 S3 버전을 맞춰 필요한 객체를 별도 검증 버킷에 복구한다.
3. 실제 소요 시간과 복구 가능한 마지막 시각, S3 객체 일치 여부를 기록한다. 검증용 RDS는 별도 요금이 발생하므로 확인 후 정리한다.
4. 실제 장애 전환은 대상 RDS의 host/instance ID와 두 서비스 URL을 함께 갱신하고 TLS·권한·객체 읽기를 확인한 뒤 진행한다. EC2 복구 시 같은 역할·버킷 접근, 환경 파일, Caddy 인증서 볼륨과 SSH/DNS 설정도 복원한다.

자동화가 RDS·버킷·유료 스냅샷을 생성하거나 운영 DB를 삭제하지 않는다. 실제 AWS IAM, 네트워크, 인증서 발급, PITR 복원은 운영 리소스에서 확인해야 한다.

## 로컬 검증 범위와 이전 구성

API 소유 통합 runner `projects/game-feedback/apps/api/scripts/shared-instance-smoke.mjs`는 실제 두 API/Web 이미지·Caddy·PostgreSQL TLS를 실행한다. S3 HTTP 경계, RDS Describe 응답과 registry 매핑만 fixture로 대체한다. 버킷 분리, DML/DDL 분리, TLS 실패 차단, S3 파일/Range, 안전한 세션 쿠키, SSE 재연결, 오래된 PITR 거부, 한 서비스 실패 시 독립 롤백, 재시작 후 파일·DB 보존, liveness/readiness를 검사한다. 실제 AWS의 IAM/S3/PITR을 검증했다는 뜻은 아니다.

`projects/game-feedback/deploy/lightsail`과 `projects/photo-contest/deploy/compose.yaml`은 이전 단독 배포 및 별도 컨테이너 회귀 테스트용이다. 새 Actions CD는 이 문서의 shared-instance 구성만 사용한다. 이전 Lightsail/Oracle/로컬 PostgreSQL volume/R2 중심의 운영 명령을 이 호스트에 적용하지 않는다. 첨부 계획의 전체 캐시 개편과 나머지 제품 결함은 이 배포 변경의 완료 범위에 포함하지 않는다.

Photo Contest의 `/backend/graphql`은 pc-web의 Next Route Handler로 보내 공개 SEO·사이트맵 캐시 무효화를 수행한다. 나머지 `/backend/*`는 pc-api로 보낸다. 해당 릴리스에서는 운영 `proxy/Caddyfile`을 동기화하고 `scripts/proxy.sh validate` 후 `reload`를 실행해야 한다. PC route 블록의 내부 경로 차단·GraphQL·일반 API·Web 순서를 유지한다.

## 재생성 동안의 요청과 호환성

Caddy route 블록은 내부·테스트·GF 관리자 경로를 프록시보다 먼저 차단한다. 차단 본문은 `edge-blocked`이며 관리자 앱은 기존 SSH 터널로 loopback API에 붙는다. 호스트 Caddyfile은 prepare.sh의 cp로 반영하고 `proxy.sh validate` 후 `proxy.sh reload`한다. 바인드 마운트 파일을 원자 교체하면 컨테이너에서 이전 inode를 볼 수 있어 에디터/rsync의 교체 방식으로 갱신하지 않는다.

모든 업스트림은 연결 실패를 250ms 간격으로 최대 140초 기다린다. 웹 요청을 먼저 종료 유예 30초 동안 마친 뒤 API 교체(종료 유예 20초 + 시작 구간 30초), 웹 시작 구간 20초를 순서대로 기다릴 여유를 뒀다. API를 먼저 내리면 진행 중인 SSR의 API 요청이 끊겨 이미 시작한 응답을 프록시가 재시도할 수 없다. 헬스체크 시작 구간은 API 30초/Web 20초이며 매초 검사한다. 재시도에서 모든 HTTP 메서드를 허용하도록 바꾸지 않는다. 연결 후 실패의 기본 GET 재시도 정책을 유지한다. 장시간 업로드·스트림·인프라 장애의 무중단을 보장하지 않는다. 종료 유예를 넘는 요청과 140초가 넘는 시작 실패는 사용자 오류가 될 수 있다. 교체 시 웹 종료 시간과 exit/OOM 상태를 기록하고, smoke가 실패하면 요청 경과 시간·교체 출력·웹 로그를 함께 남긴다.

service.sh는 같은 이미지도 실제로 재생성한다. API의 SSE는 종료 훅에서 닫고 클라이언트가 재연결한다. 공통 smoke는 서비스 스크립트로 두 서비스를 재배포하면서 실제 API/Web GET을 계속 보내 실패 수·최대 대기 시간을 기록하고 네 컨테이너 ID가 모두 바뀌었는지 검사한다. 실제 컨테이너 검증은 Docker가 있는 CI에서 수행한다.

## 확장 → 배포 → 정리

SQL은 되돌리지 않는다. 예를 들어 이름 변경은 (1) nullable 새 컬럼 추가와 이중 쓰기, (2) 새 컬럼 읽는 앱 배포와 이전 앱 종료 확인, (3) 보관 기간 후 옛 컬럼 정리로 나눈다. `node scripts/check-migrations.mjs`는 기준 ref 이후 새 migration.sql만 검사한다. 기존 위험 SQL이나 기존 migration 수정을 재검사하는 규칙이 아니다. DROP TABLE/COLUMN/CONSTRAINT/INDEX, 컬럼 타입·NOT NULL 변경, RENAME은 실패한다. 정리 단계는 해당 DDL 바로 앞에 `-- migration-lint: allow DROP COLUMN — 이전 읽기 앱 종료 후 2주 경과`처럼 정확한 규칙과 검토 가능한 사유를 쓴다. CI에서는 PR base SHA 또는 push의 before SHA를 기준으로 사용한다.

## Next 컴파일 캐시

두 웹 빌드는 각각 gf-next-cache/pc-next-cache BuildKit mount를 사용한다. shared-instance workflow는 SHA 키와 OS restore prefix의 Actions cache, 고정 커밋의 cache-dance로 mount를 복원·추출한다. 기존 GHA 이미지 레이어 캐시도 유지한다. 같은 브랜치의 두 번째 소스 변경 빌드에서 캐시 복원 로그와 Next 컴파일 시간을 비교한다. 캐시를 적용했다고 실제 속도 향상을 측정한 것으로 간주하지 않는다. 저장 한도·보존 정책은 GitHub 설정을 따른다.

## Bambyul DNS와 클라이언트 설정

- `game.bambyul.com`, `api.game.bambyul.com`, `contest.bambyul.com`, `api.contest.bambyul.com`의 A/AAAA 레코드를 같은 EC2 고정 주소로 연결한다. Caddy가 각 호스트의 TLS 인증서를 발급한다.
- `host.env.example`의 네 DOMAIN 값을 복사하고 `proxy.sh validate` 후 시작한다. API 주소는 `api.<웹 도메인>` 규칙이며 네 호스트는 서로 달라야 한다.
- GitHub Variables의 `GF_SITE_URL`은 `https://game.bambyul.com`, `PHOTO_CONTEST_SITE_URL`은 `https://contest.bambyul.com`으로 지정한다. 빌드·통합 검사의 기본 운영 origin도 이 값이다. CI HTTPS 요청은 loopback·테스트 CA를 사용하므로 실제 DNS나 운영 서버에 연결하지 않는다.
- 모바일 release의 `EXPO_PUBLIC_WEB_ORIGIN`은 각 앱의 `.env.production.example`을 참고한다. 앱 이름·홈 화면 아이콘은 네이티브 앱을 새로 빌드해야 반영된다.
