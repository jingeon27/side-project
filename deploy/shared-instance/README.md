# 공통 EC2 배포

Photo Contest와 Game Feedback을 서울 리전의 **EC2 한 대 + 외부 RDS PostgreSQL 한 인스턴스 + 서비스별 비공개 S3 버킷**으로 운영한다. 두 서비스의 API 프로토콜은 각각 GraphQL과 REST를 유지한다. 운영 이미지는 모두 `linux/amd64`다.

```text
game.example.com  ─┐                    ┌─ GF Web / GF API ─ game_feedback DB / GF S3
                  ├─ Caddy :443 ────────┤
photo.example.com ─┘                    └─ PC Web / PC API ─ photo_contest DB / PC S3
```

Caddy만 80/443을 공개한다. API·Web은 서비스별 Docker 네트워크를 사용하고 Caddy만 두 네트워크에 연결한다. GF API의 4300은 로컬 관리자 연결을 위해 EC2 loopback에만 바인딩한다. DB·원본 미디어는 EC2 볼륨에 저장하지 않는다. 이 구성은 EC2 장애 시 두 서비스가 함께 중단되는 구조다.

## AWS에서 먼저 준비할 것

1. 서울 리전에 x86_64 Linux EC2, 고정 공인 IP와 두 도메인의 DNS를 준비한다. Docker Engine/Compose plugin, Bash, Python 3, curl, OpenSSL, tar, `flock`이 필요하다. SSH는 운영자·배포 runner가 접속할 수 있도록 설정하고 앱 포트와 Docker API는 외부에 열지 않는다.
2. 같은 VPC의 **비공개 RDS PostgreSQL**을 만든다. 스토리지 암호화, 삭제 방지, 자동 백업 보존 기간 7일 이상을 설정한다. RDS 보안 그룹의 5432는 EC2 보안 그룹에서만 허용한다. `rds.force_ssl`을 활성화한 파라미터 그룹을 사용한다. 실제 RDS PostgreSQL 버전과 마이그레이션 호환성은 배포 전 별도 확인한다.
3. EC2 인스턴스 역할에 [RDS 조회 정책](rds-read-policy.json)을 붙인다. 배포 전 `DescribeDBInstances`로 복구 가능 시각을 확인한다. 이 역할에는 DB 비밀번호·S3 공통 쓰기 권한을 넣지 않는다. 컨테이너에서 IMDSv2로 인스턴스 역할을 읽으려면 EC2 metadata 응답 hop limit을 2로 설정한다.
4. 서울 리전에 서로 다른 S3 버킷 두 개를 만든다. [퍼블릭 접근 차단](s3-public-access.json), 기본 암호화, **Versioning**을 활성화한다. [수명 주기](s3-lifecycle.json)는 오래된 이전 버전과 미완료 multipart만 정리하며 현재 객체를 만료시키지 않는다. 브라우저는 API를 거쳐 파일을 받으므로 퍼블릭 버킷이나 S3 CORS 허용이 필요하지 않다.
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
| Repository Variable | `GF_SITE_URL`                                                      | GF의 `https://실제도메인`                                                                 |
| Repository Variable | `GF_CONTACT_EMAIL`                                                 | `jingeon27@gmail.com`                                                                     |
| Repository Variable | `PHOTO_CONTEST_SITE_URL`                                           | PC의 `https://실제도메인`                                                                 |
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
