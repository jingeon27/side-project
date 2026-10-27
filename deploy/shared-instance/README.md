# 공통 EC2 배포

Photo Contest와 Game Feedback을 서울 리전의 **EC2 한 대(PostgreSQL 컨테이너 포함) + 서비스별 비공개 S3 버킷**으로 운영한다. 두 서비스의 API 프로토콜은 각각 GraphQL과 REST를 유지한다. 운영 이미지는 모두 `linux/amd64`다.

```text
game.bambyul.com         ─┐              ┌─ GF Web
api.game.bambyul.com     ─┤              ├─ GF API ─ game_feedback DB / GF S3
                         ├─ Caddy :443 ─┤
contest.bambyul.com      ─┤              ├─ PC Web
api.contest.bambyul.com  ─┘              └─ PC API ─ photo_contest DB / PC S3
```

제품명은 Game Mate와 별사대(별난 사진 대회)다. 밤별 블로그는 `blog.bambyul.com`에서 별도 Vercel 프로젝트로 운영한다. `api.blog.bambyul.com`은 주소만 예약하며 현재 별도 API 서버는 없다.

웹·WebView의 세션은 기존 웹 호스트의 host-only 쿠키를 유지한다. 브라우저는 같은 origin의 `/api`·`/backend`를 사용한다. 공개 API 호스트에서도 내부·관리자·테스트 경로는 막고, 별사대 `/graphql`은 PC Web의 `/backend/graphql`로 전달하여 mutation 후 Next 캐시를 만료한다. PC Web의 `API_URL`은 `http://pc-api:4200` 같은 내부 API 주소를 유지해야 순환 프록시가 생기지 않는다. API 호스트에는 `X-Robots-Tag: noindex, nofollow`를 적용한다.

Caddy만 80/443을 공개한다. API·Web은 서비스별 Docker 네트워크를 사용하고 Caddy만 두 네트워크에 연결한다. GF API의 4300은 로컬 관리자 연결을 위해 EC2 loopback에만 바인딩한다. PostgreSQL은 같은 EC2의 컨테이너로 실행하고, 데이터는 루트 볼륨과 분리한 EBS 볼륨(`/srv/side-postgres`)에 둔다. 각 서비스의 API·ops·migrate만 서비스별 내부(`--internal`) DB 네트워크에 연결하며 Web과 Caddy는 DB에 닿지 않는다. 원본 미디어는 EC2에 저장하지 않는다. 이 구성은 EC2 장애 시 두 서비스와 DB가 함께 중단되는 구조다.

## 최초 배포 순서와 설정 화면

절차는 2026-10-25의 shared-instance 코드 기준이다. 아래 콘솔 링크는 본인 계정으로 로그인해서 사용한다. 리소스 이름·도메인 예시는 실제 소유 값으로 바꾼다. 이 문서의 명령은 저장소 루트에서 실행하며, 서버 명령과 로컬 검증 명령을 구분한다.

| 순서 | 열 화면                                                                                                                                                                                                                                                    | 실행할 행동                                                                                                                                                                                                                                                                        | 완료 확인                                            |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1    | [EC2 인스턴스](https://console.aws.amazon.com/ec2/home?region=ap-northeast-2#Instances:)                                                                                                                                                                   | 서울 리전에서 Ubuntu 24.04 **x86_64** 인스턴스를 만든다. 운영 컨테이너 한도 합계는 약 3.1GiB지만 상한일 뿐이므로 사용자가 적은 동안은 2GiB(t3.small)와 swap으로 시작하고, swap이 계속 늘거나 OOM이 생기면 4GiB로 올린다. 디스크에는 이미지 4개와 이전 릴리스가 들어갈 여유를 둔다. | 아키텍처 x86_64, 상태 검사 통과, SSH 접속 성공       |
| 2    | [Elastic IP](https://console.aws.amazon.com/ec2/home?region=ap-northeast-2#Addresses:)                                                                                                                                                                     | 고정 IP를 할당하고 위 EC2에 연결한다.                                                                                                                                                                                                                                              | 인스턴스에 연결된 공인 IP를 기록                     |
| 3    | [EC2 보안 그룹](https://console.aws.amazon.com/ec2/home?region=ap-northeast-2#SecurityGroups:)                                                                                                                                                             | 80/443을 허용하고 관리·배포용 SSH 접속 경로를 정한다. 아래 SSH 설명을 먼저 읽는다. 앱 포트 3200/3300/4200/4300과 DB 포트는 인터넷에 열지 않는다.                                                                                                                                   | 운영자와 배포 러너가 SSH로 접속 가능                 |
| 4    | [EBS 볼륨](https://console.aws.amazon.com/ec2/home?region=ap-northeast-2#Volumes:)                                                                                                                                                                         | EC2와 같은 AZ에 PostgreSQL 데이터용 암호화 gp3 볼륨을 만들고 `SnapshotPolicy` 태그를 붙여 EC2에 연결한다. 아래 2의 마운트를 수행한다.                                                                                                                                              | `/srv/side-postgres` 마운트와 표시 파일 확인         |
| 5    | [Data Lifecycle Manager](https://console.aws.amazon.com/ec2/home?region=ap-northeast-2#Lifecycle:)                                                                                                                                                         | 위 태그의 볼륨을 매일 스냅샷하고 7개를 보존하는 정책을 만든다.                                                                                                                                                                                                                     | 정책 Enabled, 다음 날 첫 스냅샷 생성                 |
| 6    | [S3 버킷](https://console.aws.amazon.com/s3/home?region=ap-northeast-2)                                                                                                                                                                                    | 서울 리전에 서비스별 일반 목적 버킷 2개와 DB 덤프용 backup 버킷 1개를 만든다. 모든 퍼블릭 액세스 차단, 기본 암호화, Versioning을 켜고 아래 lifecycle 규칙을 등록한다.                                                                                                              | 서로 다른 버킷 이름 3개, 비공개·버전 관리 활성화     |
| 7    | [IAM 정책](https://console.aws.amazon.com/iam/home#/policies) / [역할](https://console.aws.amazon.com/iam/home#/roles)                                                                                                                                     | 아래 backup 쓰기 JSON으로 EC2용 역할을 만든다. EC2 → 작업 → 보안 → IAM 역할 수정에서 연결한다. 메타데이터는 IMDSv2 필수, hop limit 1로 설정한다.                                                                                                                                   | EC2 역할로 backup 버킷 `postgres/` 업로드 성공       |
| 8    | [IAM 사용자](https://console.aws.amazon.com/iam/home#/users)                                                                                                                                                                                               | 콘솔 로그인 없는 앱 자격 증명을 서비스별로 준비한다. 아래 S3 JSON의 버킷 이름을 바꾸어 각자 자기 버킷에만 권한을 준다.                                                                                                                                                             | 각 버킷 읽기·쓰기 성공, 상대 버킷 요청 거부          |
| 9    | [Route 53 호스팅 영역](https://console.aws.amazon.com/route53/v2/hostedzones) 또는 도메인을 관리하는 DNS 화면                                                                                                                                              | 네 서비스 호스트의 A 레코드를 같은 Elastic IP로 연결한다. Route 53 사용은 필수가 아니다.                                                                                                                                                                                           | `dig +short`로 네 호스트가 고정 IP를 반환            |
| 10   | [Docker Ubuntu 설치 안내](https://docs.docker.com/engine/install/ubuntu/)                                                                                                                                                                                  | 아래 서버 준비, 환경 파일 입력, PostgreSQL 시작과 최초 DB 초기화를 수행한다.                                                                                                                                                                                                       | Docker/Compose 실행, 서비스별 DB와 역할 생성         |
| 11   | 아래 소셜 로그인 설정 화면                                                                                                                                                                                                                                 | 사용할 제공자의 앱과 콜백 주소를 등록하고 서버 환경 파일에 키를 넣는다. GF는 제공자 하나 이상이 필수다.                                                                                                                                                                            | 실제 도메인과 콜백 주소가 정확히 일치                |
| 12   | [GitHub Environments](https://github.com/jingeon27/side-project/settings/environments) / [Variables](https://github.com/jingeon27/side-project/settings/variables/actions) / [Secrets](https://github.com/jingeon27/side-project/settings/secrets/actions) | 두 Environment와 아래 이름의 변수·SSH Secret을 등록한다. 배포 활성화 값은 준비가 끝날 때까지 `false`로 둔다.                                                                                                                                                                       | Environment 2개와 필수 값 등록                       |
| 13   | 아래 프록시 명령                                                                                                                                                                                                                                           | DNS 확인 후 Caddy를 시작한다.                                                                                                                                                                                                                                                      | 인증서 발급 성공. 앱 배포 전 502는 가능              |
| 14   | [EBS 스냅샷](https://console.aws.amazon.com/ec2/home?region=ap-northeast-2#Snapshots:)                                                                                                                                                                     | 첫 일일 스냅샷이 생겼는지 확인한다. 첫 배포 후 검증 데이터를 만들고 아래 절차로 덤프·스냅샷 복원을 연습한다.                                                                                                                                                                       | 스냅샷과 backup 버킷의 배포 전 덤프 확인             |
| 15   | [develop → main 비교](https://github.com/jingeon27/side-project/compare/main...develop?expand=1) / [Actions](https://github.com/jingeon27/side-project/actions)                                                                                            | 배포 활성화 값을 `true`로 바꾸고 검토한 변경을 main에 반영해 초기 검증 배포를 한다. 아래 운영 검증과 복구 연습 후 공개한다.                                                                                                                                                        | 두 서비스 workflow의 deploy 성공, 아래 공개 URL 확인 |

기본 CD는 GitHub `ubuntu-latest`에서 서버로 SSH 접속한다. **SSH를 본인 IP에만 허용하면 CD는 연결할 수 없다.** 현재 코드에는 VPN 가입이나 SSM 전송 단계가 없으며, OIDC용 AWS 역할을 등록해도 SSH 접속을 대신하지 않는다. 제한된 SSH 소스 정책을 쓰려면 VPN을 연결하는 단계 또는 고정 IP 배포 러너를 추가하고 실제 접속을 먼저 확인해야 한다. 일반 GitHub 호스트 러너의 전체 IP 대역을 고정 허용 목록으로 취급하지 않는다. [GitHub 공식 네트워크 안내](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#ip-addresses)를 따른다.

준비할 공개 값은 EC2 IP·instance ID·보안 그룹 ID, 네 호스트 이름, PostgreSQL 볼륨 ID, 세 버킷 이름(서비스 2개와 backup), 배포 SSH 사용자·포트·확인한 host key다. 비밀번호·비밀 키·OAuth secret은 서버 환경 파일이나 지정한 GitHub Secret에 직접 입력하며 이 문서나 이슈에 적지 않는다.

## AWS에서 먼저 준비할 것

새 환경은 [Terraform 구성](terraform/README.md)으로 아래 1~5의 리소스를 만들 수 있다.

1. 서울 리전에 x86_64 Linux EC2, 고정 공인 IP와 네 호스트의 DNS를 준비한다. Docker Engine 25 이상/Compose plugin 2.20.2 이상, Bash, Python 3, curl, OpenSSL, tar, util-linux의 `flock`·`setsid`가 필요하다. 배포는 SSH 세션이 끝나도 계속 돌아야 하므로 systemd-logind `KillUserProcesses=no`(Ubuntu·Amazon Linux 기본값)를 유지한다. SSH는 운영자·배포 runner가 접속할 수 있도록 설정하고 앱 포트와 Docker API는 외부에 열지 않는다.
2. EC2와 같은 AZ에 **PostgreSQL 데이터용 암호화 gp3 EBS 볼륨**을 붙이고 ext4로 포맷해 `/srv/side-postgres`에 `nofail`로 마운트한다. 볼륨 루트에 `.side-postgres-volume` 표시 파일, `data`(0755), 배포 사용자 소유 `dumps`(0700)를 만든다. 표시 파일이 없으면 `database.sh`·`pg-backup.sh`가 멈추고 `data`가 없으면 컨테이너가 시작하지 않으므로, 마운트가 빠져도 루트 디스크에 빈 DB가 생기지 않는다. [Data Lifecycle Manager](https://docs.aws.amazon.com/ebs/latest/userguide/snapshot-lifecycle.html)로 이 볼륨을 매일 스냅샷하고 7개를 보존한다. Terraform은 볼륨·스냅샷 정책과 첫 부팅의 포맷·마운트를 함께 처리한다.
3. EC2 인스턴스 역할에 [backup 쓰기 정책](backup-write-policy.json)을 붙인다. `BACKUP_BUCKET_NAME`을 backup 버킷 이름으로 바꾼다. 이 역할은 `postgres/` 아래에 덤프를 올리기만 하며 읽기·목록·삭제 권한이 없다. DB 비밀번호와 서비스 버킷 권한은 넣지 않는다. IMDSv2를 필수로 하고 metadata 응답 hop limit은 1로 둔다. 덤프 업로드용 aws-cli만 `--network host`로 역할을 읽고, bridge 네트워크의 앱 컨테이너는 IMDS에 닿지 않는다.
4. 서울 리전에 서로 다른 S3 버킷 두 개를 만든다. [퍼블릭 접근 차단](s3-public-access.json), 기본 암호화, **Versioning**을 활성화한다. [수명 주기](s3-lifecycle.json)는 오래된 이전 버전과 미완료 multipart만 정리하며 현재 객체를 만료시키지 않는다. Game Feedback 게시글·채팅 첨부는 presigned POST로 직접 전송하므로 해당 버킷에 [CORS 예시](../../projects/game-feedback/deploy/shared-instance/s3-cors.json)의 origin을 실제 도메인으로 바꿔 적용한다. Photo Contest는 모든 사진·동영상을 presigned POST로 올리고 60초 presigned GET으로 읽으므로 해당 버킷에 [PC CORS](../../projects/photo-contest/deploy/shared-instance/s3-cors.json)의 실제 웹 origin(POST)을 적용한다. 수명 주기는 위 공통 규칙을 그대로 쓰며 staging 접두사 규칙은 필요 없다. 완료하지 않은 업로드는 API 정리 작업이 지운다. 버킷 공개 접근은 계속 차단한다. [Game Feedback 업로드와 조회 검증](../../projects/game-feedback/docs/media-upload.md), [Photo Contest 배포 순서](../../projects/photo-contest/docs/deployment.md)를 확인한다. DB 덤프용 backup 버킷은 서비스 버킷과 따로 만들고 같은 차단·암호화·Versioning을 켠다. `postgres/` 객체는 30일 뒤 만료하고 CORS는 두지 않는다.
5. [S3 앱 정책](s3-app-policy.json)의 `SERVICE_BUCKET_NAME`을 각 버킷으로 바꾸고 서비스별 IAM 자격 증명을 발급한다. 각 계정은 자기 버킷만 읽고 쓸 수 있어야 한다. 한쪽 자격 증명으로 다른 버킷을 읽거나 쓰는 요청이 거부되는지 AWS에서 직접 확인한다. 덤프 업로드용 EC2 역할과 이 두 자격 증명을 구분한다.

상시 컨테이너 메모리 한도 합계는 약 3.1GiB(PostgreSQL 512M 포함)이며 운영 도구·OS·업로드 처리에는 추가 메모리가 필요하다. 실제 인스턴스 크기와 DB 연결 수(`max_connections=40`)는 업로드·동시 채팅·SSR 부하를 측정해 결정한다. 호스트에서 운영 이미지를 빌드하지 않는다.

[AWS CLI 설치 안내](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)에 따라 운영자 로컬 환경 또는 AWS CloudShell에서 AWS CLI를 준비한다. 아래 명령은 저장소를 받은 디렉터리에서 `YOUR_BUCKET_NAME`을 실제 버킷 이름으로 바꾸고 서비스별로 한 번씩 실행한다. 앱 자격 증명에는 버킷 관리 권한을 추가하지 않는다. [S3 수명 주기 CLI 안내](https://docs.aws.amazon.com/cli/latest/reference/s3api/put-bucket-lifecycle-configuration.html)를 참고한다.

```sh
aws s3api put-bucket-lifecycle-configuration \
  --region ap-northeast-2 \
  --bucket YOUR_BUCKET_NAME \
  --lifecycle-configuration file://deploy/shared-instance/s3-lifecycle.json
```

## 호스트 파일과 DB 초기화

서버에 저장소를 체크아웃한 뒤 배포 사용자 소유 디렉터리를 준비한다. 다음 작업은 AWS 리소스를 생성하지 않는다.

Ubuntu에서 `git`, `python3`, `curl`, `openssl`, `e2fsprogs`, `util-linux`를 설치하고 [공식 Docker 저장소 설치 절차](https://docs.docker.com/engine/install/ubuntu/#install-using-the-apt-repository)로 Docker Engine과 `docker-compose-plugin`을 설치한다. 배포 사용자에게 Docker 실행 권한을 부여한 뒤 새 SSH 세션에서 확인한다. 이후 CD도 동일 사용자를 쓴다. [Docker 그룹 설정](https://docs.docker.com/engine/install/linux-postinstall/)은 호스트 관리 권한을 주는 설정이다.

```sh
git clone --branch main https://github.com/jingeon27/side-project.git
cd side-project
docker version
docker compose version
python3 --version
```

```sh
sudo install -d -m 700 -o "$USER" -g "$(id -gn)" /srv/side-project
bash deploy/shared-instance/scripts/prepare.sh
```

다음 파일을 서버에서 편집한다. Git이나 Actions 로그에 실제 값을 올리지 않는다. Compose가 읽는 파일이므로 `source`하지 않는다.

| 파일                                            | 설정                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `/srv/side-project/.env`                        | 네 호스트 이름, ACME 메일, 두 서비스 버킷과 backup 버킷 이름        |
| `/srv/side-project/services/game-feedback/.env` | GF runtime/migrator DB URL, GF 버킷 자격 증명, OAuth·Supercell 설정 |
| `/srv/side-project/services/photo-contest/.env` | PC runtime/migrator DB URL, PC 버킷 자격 증명, 선택적 Sentry 설정   |
| `/srv/side-project/database/.env`               | initdb용 superuser 비밀번호. `prepare.sh`가 만들며 편집하지 않는다  |

원본 예시는 [호스트 환경 파일](host.env.example), [GF 환경 파일](../../projects/game-feedback/deploy/shared-instance/service.env.example), [PC 환경 파일](../../projects/photo-contest/deploy/shared-instance/service.env.example)이다. `GAME_FEEDBACK_DOMAIN`, `GAME_FEEDBACK_API_DOMAIN`, `PHOTO_CONTEST_DOMAIN`, `PHOTO_CONTEST_API_DOMAIN`에는 `https://`나 경로를 붙이지 않는다. GitHub의 `*_SITE_URL`에는 `https://`를 포함하고 마지막 `/`는 붙이지 않는다. 호스트의 버킷 이름과 각 서비스 자격 증명의 권한 대상이 일치해야 한다. GF는 ENVIRONMENT=production인 HTTPS 운영 환경에서 검색 수집을 허용한다.

`prepare.sh`는 프록시 파일과 DB 구성(`database/compose.yaml`, `pg_hba.conf`, `bootstrap.sql`)을 복사하고, 처음 한 번 initdb용 superuser 비밀번호를 `database/.env`에 만든다. 이미 존재하는 환경변수 파일은 덮어쓰지 않는다. 프록시 파일은 처음 한 번 현재 저장소 버전으로 복사한다. 이후 변경은 아래 [공용 Caddyfile 동기화](#공용-caddyfile-동기화)를 따른다.

PostgreSQL 볼륨이 마운트됐는지 확인한 뒤 DB를 시작하고, 새 클러스터에 [부트스트랩 SQL](database/bootstrap.sql)을 **한 번** 적용한다. `start`는 서비스별 내부 DB 네트워크를 만들고 healthcheck가 통과할 때까지 기다린다. 각 `\password` 프롬프트에 서로 다른 32자 이상의 비밀번호를 입력한다. DB URL 비밀번호는 URL 인코딩한다.

```sh
mountpoint /srv/side-postgres && cat /srv/side-postgres/.side-postgres-volume
bash deploy/shared-instance/scripts/database.sh start
bash deploy/shared-instance/scripts/database.sh bootstrap
```

| 서비스        | Database        | 실행 중 DML 계정 | 일회성 DDL 계정          |
| ------------- | --------------- | ---------------- | ------------------------ |
| Game Feedback | `game_feedback` | `game_feedback`  | `game_feedback_migrator` |
| Photo Contest | `photo_contest` | `photo_contest`  | `photo_contest_migrator` |

각 DB와 `postgres`·`template1`의 PUBLIC 접속 권한을 회수하고 자기 서비스만 접속하도록 설정한다. [`pg_hba.conf`](database/pg_hba.conf)도 서비스 role을 자기 DB로만 받고, superuser는 컨테이너 Unix socket(`database.sh psql`)에서만 받으며 네트워크 로그인을 거부한다. runtime 계정은 schema 생성, role 생성, DB 생성, superuser 권한을 갖지 않는다. migration 실행 후 앱 테이블의 DML 권한을 부여하고 `_prisma_migrations` 접근은 회수한다. DDL 비밀번호는 일회성 migrate 컨테이너에만 전달한다. 관리자 DB URL을 runtime에 넣지 않는다.

현재 Prisma PostgreSQL 연결 URL은 `shared-postgres:5432`와 `sslmode=disable`을 사용한다. DB 트래픽은 같은 호스트의 내부 Docker 네트워크를 벗어나지 않으므로 TLS를 쓰지 않는다. URL의 호스트(`shared-postgres`), DB, role, 인증서 설정 부재, 연결·풀 대기 한도를 시작 시 검사한다. 각 API의 기본 풀은 5개이며 migrator는 2개다.

DB 구성 파일을 바꾸면 `prepare.sh`로 다시 복사한 뒤 `database.sh start`를 실행한다. 설정이 바뀌었으면 Compose가 PostgreSQL 컨테이너만 다시 만들고 데이터 볼륨은 그대로 둔다. 볼륨을 늘리면 Terraform 또는 콘솔에서 크기를 바꾼 뒤 서버에서 `sudo resize2fs "$(findmnt -no SOURCE /srv/side-postgres)"`로 파일 시스템을 넓힌다.

## 소셜 로그인과 선택적 외부 서비스

서비스별로 별도 OAuth 앱·클라이언트를 만들고, 발급한 ID/secret을 **해당 서비스 서버 환경 파일**에 넣는다. GF는 ID와 secret 한 쌍을 하나 이상 설정해야 시작한다. 운영에서는 데모 로그인과 테스트 토큰 발급 API가 비활성화된다. PC는 아이디·비밀번호 로그인도 제공한다.

| 제공자  | 설정 화면과 행동                                                                                                                                                                                                                                                                                                                                               | GF 콜백                                                     | PC 콜백                                                    |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| Google  | [Google Auth Platform](https://console.cloud.google.com/auth/overview)에서 프로젝트 선택 → Branding/Audience 설정 → [Clients](https://console.cloud.google.com/auth/clients)에서 웹 애플리케이션 클라이언트 생성. 승인된 리디렉션 URI 입력, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` 저장. 공개 출시 시 Audience의 게시 상태와 필요한 도메인 확인을 완료한다. | `https://game.bambyul.com/api/auth/google/callback`         | `https://contest.bambyul.com/backend/auth/google/callback` |
| Kakao   | [Kakao 앱 관리](https://developers.kakao.com/console/app)에서 앱 생성 → 카카오 로그인 활성화 → 리디렉션 URI 등록. 플랫폼 키의 REST API 키와 해당 Client Secret을 `KAKAO_CLIENT_ID`/`KAKAO_CLIENT_SECRET`에 저장한다.                                                                                                                                           | `https://game.bambyul.com/api/auth/social/kakao/callback`   | `https://contest.bambyul.com/backend/auth/kakao/callback`  |
| X       | [Developer Console](https://console.x.com/)에서 앱의 OAuth 2.0 사용자 인증을 설정한다. 서버용 confidential/web app의 Client ID/secret을 `X_CLIENT_ID`/`X_CLIENT_SECRET`에 저장하고 콜백 URL·웹사이트 URL을 입력한다. 현재 코드는 `tweet.read users.read`와 PKCE를 사용한다. 콘솔의 이용 조건과 API 접근 가능 여부도 확인한다.                                  | `https://game.bambyul.com/api/auth/social/x/callback`       | 미지원                                                     |
| Discord | [Developer Portal](https://discord.com/developers/applications) → New Application → OAuth2에서 Redirects를 추가한다. Client ID/secret을 `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`에 저장한다. 로그인 범위는 `identify`다. 봇 생성·서버 초대는 필요 없다.                                                                                                     | `https://game.bambyul.com/api/auth/social/discord/callback` | 미지원                                                     |

콜백은 문자 단위로 맞춘다. Google은 [공식 웹 서버 OAuth 안내](https://developers.google.com/identity/protocols/oauth2/web-server), Kakao는 [사전 설정 안내](https://developers.kakao.com/docs/ko/kakaologin/prerequisite), X는 [OAuth 2.0 PKCE 안내](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code), Discord는 [OAuth2 안내](https://docs.discord.com/developers/topics/oauth2)를 따른다. 초기에는 테스트 사용자로 실제 로그인·취소·재로그인을 확인한 뒤 제공자의 공개 설정을 적용한다.

Google Branding에 입력할 서비스 홈페이지·약관·개인정보 주소는 아래 경로를 실제 도메인과 조합한다. 도메인 소유권 확인이 필요하면 [Search Console](https://search.google.com/search-console/)에서 제공하는 DNS 레코드를 등록한다. OAuth 동의 화면을 테스트 상태로 두면 일반 사용자 공개 로그인 확인을 마친 것이 아니다. [Google OAuth 정책](https://developers.google.com/identity/protocols/oauth2/policies)의 홈페이지·도메인 요구사항도 확인한다.

| 서비스 | 홈페이지                      | 이용약관                            | 개인정보처리방침                      |
| ------ | ----------------------------- | ----------------------------------- | ------------------------------------- |
| GF     | `https://game.bambyul.com/ko` | `https://game.bambyul.com/ko/terms` | `https://game.bambyul.com/ko/privacy` |
| PC     | `https://contest.bambyul.com` | `https://contest.bambyul.com/terms` | `https://contest.bambyul.com/privacy` |

Clash Royale API 조회를 사용할 때는 [Supercell 개발자 포털](https://developer.clashroyale.com/)에서 키를 발급하고 EC2의 실제 외부 통신 IP를 허용한 뒤 `SUPERCELL_API_TOKEN`에 저장한다. 이 키는 관리자에 의한 수동 프로필 인증과 별개다.

## Sentry와 Amplitude 설정

현재 연결 상태부터 확인한다. 콘솔에서 키를 만들었다는 것과 운영에서 이벤트가 수집된다는 것은 별도로 확인해야 한다.

| 대상            | 키 입력으로 사용할 수 있는 경로                                                                                                                                   | 코드 보완이 필요한 부분                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| PC API          | 서버 환경 파일의 `SENTRY_DSN`으로 예상하지 못한 오류 수집                                                                                                         | 자동 HTTP/DB tracing은 꺼져 있다. `SENTRY_TRACES_SAMPLE_RATE`만 올려도 자동 계측이 추가되지는 않는다.    |
| PC Web 브라우저 | repository Variables의 Sentry DSN·Amplitude API key를 이미지 빌드에 주입                                                                                          | `tracesSampleRate: 0`이므로 운영 Web Vitals 수집을 완료했다고 볼 수 없다. 소스맵 업로드 연결도 필요하다. |
| PC Next 서버    | 런타임 `SENTRY_DSN`을 우선하고, 없으면 빌드에 들어간 공개 DSN을 사용한다.                                                                                         | 별도 서버 프로젝트를 쓰려면 Web Compose에 런타임 DSN을 주입해야 한다. 서버 tracing은 꺼져 있다.          |
| PC Mobile       | Expo 빌드 환경의 `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_AMPLITUDE_API_KEY`                                                                                        | EC2 웹 배포와 별도로 앱을 새로 빌드해야 한다.                                                            |
| GF Web/API      | Web 빌드의 `GAME_FEEDBACK_WEB_SENTRY_DSN`·`GAME_FEEDBACK_AMPLITUDE_API_KEY`, API 서버 환경 파일의 `SENTRY_DSN`을 사용한다. Next 서버는 공개 DSN으로 fallback한다. | tracing과 소스맵 업로드는 꺼져 있다. 실제 수신은 외부 콘솔에서 확인한다.                                 |
| GF Mobile       | WebView 안의 웹 이벤트가 GF Web 키로 전송된다.                                                                                                                    | 네이티브 셸 전용 관측 SDK는 없다.                                                                        |

### Sentry 프로젝트와 DSN

1. [Sentry](https://sentry.io/)에 로그인하고 Organization을 준비한다. Projects → Create Project에서 `photo-contest-web`은 Next.js, `photo-contest-api`는 Node.js/NestJS 플랫폼으로 만든다. GF도 별도 `game-feedback-web`, `game-feedback-api` 프로젝트를 만든다. 네이티브 앱 오류를 수집할 때는 서비스별 React Native 프로젝트를 따로 둔다.
2. [프로젝트 설정](https://sentry.io/settings/) → 해당 Organization → Projects → 프로젝트 → Client Keys (DSN)에서 DSN을 복사한다. **Auth Token이 아니라 DSN**을 아래 대응 위치에 입력한다. 브라우저 DSN은 공개 번들에 포함될 수 있는 값이다. [Sentry Next.js 설정 안내](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/)를 참고한다.
3. PC API DSN을 `/srv/side-project/services/photo-contest/.env`의 `SENTRY_DSN`에, PC Web DSN을 [GitHub Variables](https://github.com/jingeon27/side-project/settings/variables/actions)의 `PHOTO_CONTEST_WEB_SENTRY_DSN`에 넣는다. PC API는 기본 `SENTRY_TRACES_SAMPLE_RATE=0`을 유지하면 오류 수집 경로를 사용한다. GF API DSN은 `/srv/side-project/services/game-feedback/.env`의 `SENTRY_DSN`에, GF Web DSN은 repository Variable `GAME_FEEDBACK_WEB_SENTRY_DSN`에 넣는다.
4. 프로젝트의 알림 설정에서 예상하지 못한 오류와 새 오류 알림의 수신자를 지정한다. 운영·개발 확인을 분리하려면 테스트 환경 또는 별도 테스트 프로젝트에서 먼저 검증한다.

### Amplitude 프로젝트와 API key

1. [Amplitude](https://app.amplitude.com/) → Settings → Organization settings → Projects → Create Project에서 서비스별 프로젝트 `photo-contest-production`, `game-feedback-production`을 만든다. 개발 검증용 프로젝트도 별도로 둔다. 현재 PC SDK에는 EU `serverZone` 설정이 없으므로 기본 US 수집 경로에 맞는 프로젝트를 사용한다. EU를 선택하려면 Web/Mobile SDK 설정도 함께 바꾼다. [프로젝트 생성 안내](https://amplitude.com/docs/get-started/create-project), [지역별 수집 안내](https://amplitude.com/docs/apis/analytics/http-api-quickstart)를 참고한다.
2. Organization settings → API Keys에서 해당 프로젝트를 선택하고 API key를 확인한다. 이 키는 이벤트 수집용이며 데이터 조회·관리용 secret key와 용도가 다르다. [키 관리 안내](https://amplitude.com/docs/admin/account-management/manage-your-api-keys-and-secret-keys)를 따른다.
3. PC Amplitude API key를 [GitHub Variables](https://github.com/jingeon27/side-project/settings/variables/actions)의 `PHOTO_CONTEST_AMPLITUDE_API_KEY`에 넣는다. GF Amplitude API key는 repository Variable `GAME_FEEDBACK_AMPLITUDE_API_KEY`에 넣는다. 한 서비스의 Web과 Mobile은 같은 Amplitude 프로젝트를 사용하고 서비스 간에는 분리한다. PC 앱을 배포할 때는 같은 키를 Expo 빌드 환경의 `EXPO_PUBLIC_AMPLITUDE_API_KEY`에도 넣는다.
4. PC 코드는 `page_viewed`와 도메인 성공 이벤트를 직접 보낸다. 콘솔에서 제공하는 자동 수집 스크립트를 추가로 붙이지 않는다. 로그인한 계정의 DB 사용자 ID로 Web/Mobile을 식별하며, WebView의 기기 ID는 네이티브와 공유한다. 닉네임·채팅 본문·세션 토큰은 이벤트 속성에 넣지 않는다.

### 키를 넣는 위치와 적용 시점

| 위치                       | 키                                | 입력할 값                     | 적용                   |
| -------------------------- | --------------------------------- | ----------------------------- | ---------------------- |
| GitHub repository Variable | `PHOTO_CONTEST_WEB_SENTRY_DSN`    | PC Web 프로젝트 DSN           | Web 이미지 재빌드·배포 |
| GitHub repository Variable | `PHOTO_CONTEST_AMPLITUDE_API_KEY` | PC Amplitude 프로젝트 API key | Web 이미지 재빌드·배포 |
| GitHub repository Variable | `GAME_FEEDBACK_WEB_SENTRY_DSN`    | GF Web 프로젝트 DSN           | Web 이미지 재빌드·배포 |
| GitHub repository Variable | `GAME_FEEDBACK_AMPLITUDE_API_KEY` | GF Amplitude 프로젝트 API key | Web 이미지 재빌드·배포 |
| 서버 GF 환경 파일          | `SENTRY_DSN`                      | GF API 프로젝트 DSN           | 다음 API 배포에 적용   |
| 서버 PC 환경 파일          | `SENTRY_DSN`                      | PC API 프로젝트 DSN           | 다음 API 배포에 적용   |
| 서버 PC 환경 파일          | `SENTRY_TRACES_SAMPLE_RATE`       | 현재 오류 수집 경로는 `0`     | 다음 API 배포에 적용   |
| Expo 빌드 환경             | `EXPO_PUBLIC_SENTRY_DSN`          | PC Mobile 프로젝트 DSN        | 앱 새 빌드·배포        |
| Expo 빌드 환경             | `EXPO_PUBLIC_AMPLITUDE_API_KEY`   | PC Amplitude 프로젝트 API key | 앱 새 빌드·배포        |

브라우저의 `NEXT_PUBLIC_*` 값은 Next 빌드 때 포함된다. 서버 환경 파일 수정이나 기존 컨테이너 재시작만으로 웹 키가 바뀌지 않으므로 새 이미지가 필요하다. GF의 로컬 설정과 이벤트 카탈로그는 [오류와 이용 흐름 관측](../../projects/game-feedback/docs/observability.md)을 따른다. GF Web과 PC Web 모두 Next 서버의 별도 런타임 DSN 전달은 현재 Web Compose에 포함되지 않으므로 공개 DSN fallback을 사용한다.

### Web Vitals와 소스맵

오류 수집, 성능 tracing, 소스맵 업로드를 각각 확인한다. Web Vitals를 수집하려면 브라우저 tracing 설정과 샘플링을 보완해야 한다. 운영 샘플링을 처음에는 0.1 정도로 검토하고 실제 사용량에 맞춰 조정할 수 있다. **tracing 전송에 소스맵 업로드용 Auth Token이 필요한 것은 아니다.** [Sentry tracing/Web Vitals 안내](https://docs.sentry.io/platforms/javascript/guides/nextjs/tracing/)를 따른다.

읽을 수 있는 운영 스택을 위해서는 Next 빌드에 `withSentryConfig`, 프로젝트 식별자 `SENTRY_ORG`/`SENTRY_PROJECT`, [GitHub Secret](https://github.com/jingeon27/side-project/settings/secrets/actions)의 `SENTRY_AUTH_TOKEN`을 연결하는 추가 작업이 필요하다. 현재 workflow에는 이 Secret을 읽거나 소스맵을 올리는 단계가 없으므로 등록만으로 업로드되지 않는다. 토큰은 `NEXT_PUBLIC_*`에 넣지 않고 비밀 빌드 입력으로 전달해야 한다. [소스맵 업로드 안내](https://docs.sentry.io/platforms/javascript/guides/nextjs/sourcemaps/)를 참고한다.

### 수집 확인 행동과 성공 기준

| 대상            | 확인할 행동                                                                                                      | 성공 기준                                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Sentry 브라우저 | 테스트 프로젝트 키로 빌드한 격리 환경에서 식별 가능한 테스트 오류를 보내고, 개발자 도구에서 `envelope` 요청 확인 | 같은 프로젝트의 Issues에 오류가 보이며 client 태그와 환경을 구분할 수 있음                                                                  |
| Sentry API      | 격리 환경에서 예상하지 못한 5xx 오류 보고 경로 확인. 운영 API에 의도적으로 장애를 만들지 않음                    | API 프로젝트에 오류가 보이고, 정상적인 4xx 업무 오류는 보고되지 않음                                                                        |
| Amplitude       | 로그인 → 페이지 이동 → 그룹 생성 등 실제 성공 동작 → 로그아웃 → 다른 계정 로그인                                 | 이벤트/사용자 화면에서 `page_viewed`, `login_succeeded` 등 발생 확인. 계정 전환 후 User ID가 바뀌며 WebView/네이티브가 같은 사용자를 가리킴 |
| Web Vitals      | 계측 보완 후 페이지 로드·상호작용·이동을 수행                                                                    | Sentry Web Vitals 화면에서 LCP/INP/CLS 확인. Sentry Issues에 오류가 보이는 것만으로 성능 수집 성공으로 보지 않음                            |

DSN과 API key를 아직 제공하지 않은 로컬 테스트는 초기화 옵션, 개인정보 제거, 이벤트 카탈로그·계정 전환 동작을 검증한다. 실제 외부 프로젝트의 수신 성공은 위 확인 절차를 수행한 뒤 기록한다.

## 프록시와 GitHub Actions

도메인 DNS가 EC2를 가리키고 80/443이 열려 있는 상태에서 설정을 검증하고 프록시를 시작한다. API가 아직 실행되지 않았다면 프록시는 잠시 502를 돌려줄 수 있다.

```sh
bash deploy/shared-instance/scripts/proxy.sh validate
bash deploy/shared-instance/scripts/proxy.sh start
```

SSH 접속 값과 키는 두 배포 Environment(GF `production`, PC `photo-contest-production`, 둘 다 배포 브랜치 `main`으로 제한)에 각각 등록하고 repository secret에는 두지 않는다. 나머지는 repository variable이다.

[Environment 설정](https://github.com/jingeon27/side-project/settings/environments)에서 정확히 `production`, `photo-contest-production`을 만들고 운영 배포 브랜치를 허용한다. [Actions Variables](https://github.com/jingeon27/side-project/settings/variables/actions)에서 공개 설정을, [Actions Secrets](https://github.com/jingeon27/side-project/settings/secrets/actions)에서 private key를 등록한다. 공통 SSH 설정을 repository 범위에 두면 두 Environment에 중복 입력할 필요가 없다. [GitHub Environment 안내](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)를 따른다.

| 종류                | 이름                                                                                                       | 값                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Variable            | `SIDE_DEPLOY_HOST`                                                                                         | EC2 공인 IP 또는 SSH 호스트                                                                                             |
| Variable            | `SIDE_DEPLOY_SSH_USER`                                                                                     | `/srv/side-project`와 Docker 접근 권한을 가진 사용자                                                                    |
| Variable            | `SIDE_DEPLOY_SSH_PORT`                                                                                     | 보통 `22`                                                                                                               |
| Variable            | `SIDE_DEPLOY_SSH_KNOWN_HOSTS`                                                                              | 신뢰할 경로로 확인한 서버 host key. 검증 없는 `ssh-keyscan` 결과를 그대로 신뢰하지 않는다                               |
| Secret              | `SIDE_DEPLOY_SSH_KEY`                                                                                      | 배포용 SSH private key                                                                                                  |
| Repository Variable | `GAME_FEEDBACK_SITE_URL`                                                                                   | `https://game.bambyul.com`                                                                                              |
| Repository Variable | `GAME_FEEDBACK_CONTACT_EMAIL`                                                                              | `contact@bambyul.com`                                                                                                   |
| Repository Variable | `PHOTO_CONTEST_SITE_URL`                                                                                   | `https://contest.bambyul.com`                                                                                           |
| Repository Variable | `PHOTO_CONTEST_DEPLOY_BRANCH`                                                                              | 운영 배포 브랜치. push 트리거와 Environment 제한에 맞춰 `main`                                                          |
| Repository Variable | `PHOTO_CONTEST_WEB_SENTRY_DSN` / `PHOTO_CONTEST_AMPLITUDE_API_KEY`                                         | 선택적 공개 Web 빌드 설정                                                                                               |
| Repository Variable | `GAME_FEEDBACK_WEB_SENTRY_DSN` / `GAME_FEEDBACK_AMPLITUDE_API_KEY`                                         | 선택적 GF Web 빌드 설정                                                                                                 |
| Repository Variable | `GAME_FEEDBACK_DEPLOY_ENABLED`                                                                             | 준비 중 `false`, 공개 배포 준비 후 `true`                                                                               |
| Repository Variable | `PHOTO_CONTEST_DEPLOY_ENABLED`                                                                             | 준비 중 `false`, 공개 배포 준비 후 `true`                                                                               |
| Repository Variable | `GAME_FEEDBACK_S3_BUCKET` / `PHOTO_CONTEST_S3_BUCKET`                                                      | CI 통합·브라우저 테스트가 쓰는 기존 버킷. 테스트는 `<prefix>/tests/<실행 ID>/`만 쓰고 끝나면 지운다                     |
| Repository Variable | `GAME_FEEDBACK_S3_KEY_PREFIX` / `PHOTO_CONTEST_S3_KEY_PREFIX`                                              | 선택. 비우면 `game-feedback/ci`, `photo-contest/ci`                                                                     |
| Repository Secret   | `GAME_FEEDBACK_S3_ACCESS_KEY_ID` / `GAME_FEEDBACK_S3_SECRET_ACCESS_KEY`                                    | CI 전용 IAM 키. 테스트 경로의 Get·Put·DeleteObject와 그 경로로 제한한 ListBucket만 준다. 운영 앱 키를 재사용하지 않는다 |
| Repository Secret   | `PHOTO_CONTEST_S3_ACCESS_KEY_ID` / `PHOTO_CONTEST_S3_SECRET_ACCESS_KEY` / `PHOTO_CONTEST_S3_SESSION_TOKEN` | 위와 같다. 세션 토큰은 임시 키일 때만 넣는다                                                                            |

이름은 한 서비스 전용 값이면 `GAME_FEEDBACK_`·`PHOTO_CONTEST_`, 두 서비스가 함께 쓰는 배포 값이면 `SIDE_DEPLOY_`로 시작한다. 워크플로가 이 값을 각 앱이 읽는 환경변수 이름(GF의 `GF_S3_*`, PC의 `S3_*`·`AWS_*`)으로 바꿔 전달하므로 앱 설정 이름은 바꾸지 않는다. S3 테스트 값이 없거나 Secrets를 받지 못하는 외부 fork PR에서는 통합·브라우저 검사가 실패한다.

배포 키는 로컬에서 별도로 만든다. 공개키 `.pub`는 서버 배포 사용자의 `~/.ssh/authorized_keys`에 추가하고, 개인키는 `SIDE_DEPLOY_SSH_KEY` Secret에 원문 그대로 넣는다. 서버의 `/etc/ssh/ssh_host_ed25519_key.pub`를 신뢰할 수 있는 EC2 콘솔 세션에서 읽어 IP/호스트와 함께 known_hosts 형식으로 등록한다. 예를 들어 22번 포트는 `EC2_IP ssh-ed25519 공개호스트키`, 다른 포트는 `[EC2_IP]:PORT ssh-ed25519 공개호스트키`다. 이 값은 배포 사용자 로그인 공개키와 다른 **서버 host key**다.

```sh
ssh-keygen -t ed25519 -f ~/.ssh/side-project-deploy -C side-project-actions
```

코드의 SSH 단계는 대화형 비밀번호 입력 없이 실행한다. 암호문이 설정된 개인키를 해제하는 단계는 없으므로 이 전용 키의 passphrase는 비워 두고 GitHub Secret으로 보관한다. 키를 등록한 뒤 배포 러너와 같은 네트워크 경로에서 `BatchMode=yes`와 등록한 known_hosts를 사용해 접속을 확인한다.

공개 Web 빌드 변수는 재사용 workflow의 빌드 시 읽으므로 **repository variable**에 둔다. 운영 DB·S3·OAuth 비밀은 서버의 서비스별 환경 파일에만 두고, GitHub에는 CI 테스트 전용 S3 키만 repository secret으로 둔다. GHCR은 Actions의 단기 `GITHUB_TOKEN`으로 로그인하며 서버에 토큰을 남기지 않는다.

설정과 DB 초기화를 마친 뒤 `GAME_FEEDBACK_DEPLOY_ENABLED=true`, `PHOTO_CONTEST_DEPLOY_ENABLED=true`를 repository variable로 설정해 초기 검증 배포를 수행한다. 첫 배포 후 검증 데이터를 준비하고 아래 덤프·스냅샷 복원 연습을 마친 뒤 공개한다. GF는 main의 push와 main에서 실행한 workflow_dispatch, PC는 `PHOTO_CONTEST_DEPLOY_BRANCH` push(태그 push 제외)에서만 배포한다. PR은 테스트만 실행한다. 기능 브랜치의 PR 대상 `develop`은 이 배포 브랜치 설정과 별개다.

Actions는 공통 환경에서 네 운영 이미지를 한 번 빌드·검증한 뒤 아카이브한다. 각 서비스의 추가 검사와 필수 테스트가 성공하면 **그 이미지**를 GHCR로 push하고 digest로 배포한다. 배포 job의 GitHub concurrency group은 서비스별이라 한 서비스의 대기 배포가 다른 서비스 때문에 취소되지 않는다. 두 서비스의 배포·롤백·이미지 정리·프록시 갱신은 서버의 공통 `flock`이 직렬화한다. 배포 순서는 Caddyfile 일치 확인 → runtime DB/S3 접근 검사 → 서비스 DB 덤프·backup 버킷 업로드 → migration → API/Web readiness → current/previous 갱신이다. 호스트의 공통 Caddy와 다른 서비스는 교체하지 않는다.

배포 job은 먼저 `ci-superseded.sh`로 이 커밋 뒤에 같은 서비스의 경로 필터에 걸리는 커밋이 배포 브랜치에 있는지 본다. 있으면 그 커밋의 실행이 새 릴리스를 배포하므로 job summary에 이유를 남기고 생략한다. 다른 서비스나 문서만 바꾼 커밋은 검증한 릴리스를 생략시키지 않는다.

### 원격 배포 실행과 로그

`ci-upload.sh`가 릴리스(서비스 compose, 공용 Caddyfile, 호스트 스크립트)를 올리면 `receive.sh`가 SSH 세션 안에서 단기 `GITHUB_TOKEN`으로 두 digest를 받은 뒤 토큰을 지우고, `setsid`·`nohup`으로 분리한 `deploy-job.sh`에 배포를 넘긴다. 분리된 작업은 레지스트리 자격 증명 없이 미리 받은 이미지로 `service.sh deploy`를 끝까지 실행하므로 runner 취소·timeout·SSH 끊김이 web 정지 뒤나 롤백 도중의 배포를 끊지 않는다. CI는 `job-status.sh`로 로그와 결과를 최대 40분 따라가며(job timeout 45분) 원격 결과대로 성공·실패한다. 따라가기를 멈춰도 배포는 호스트에서 계속된다.

각 실행의 로그와 종료 코드는 `/srv/side-project/services/<서비스>/releases/<sha>/.deploy/run-*/{log,status}`에 남는다. 서비스마다 마지막 요청(`.deploy-request`)만 진행하므로, 호스트 잠금을 오래 기다린 이전 작업이 더 새 배포를 덮어쓰지 않고 아무것도 바꾸지 않은 채 끝난다.

### 공용 Caddyfile 동기화

공용 Caddyfile은 서비스 배포가 교체하지 않는다. 대신 릴리스에 CI가 검증한 `Caddyfile`을 함께 올리고, `service.sh deploy`는 호스트 `proxy/Caddyfile`과 다르면 검사·마이그레이션 전에 멈추며 동기화 명령을 출력한다. 이 경우 서버에서 다음을 실행한 뒤 실패한 배포 job을 다시 실행한다. `sync`는 기존 파일을 `Caddyfile.previous`로 남기고 같은 inode에 새 내용을 쓴 뒤 validate에 실패하면 되돌리고, 통과하면 reload한다.

```sh
deployment_release_dir=/srv/side-project/services/YOUR_SERVICE/releases/YOUR_RELEASE_SHA
bash "$deployment_release_dir/host/proxy.sh" sync "$deployment_release_dir/Caddyfile"
```

두 서비스의 릴리스는 같은 Caddyfile을 가져야 하므로 두 배포 브랜치를 같게(`main`) 둔다. 요청 본문 상한은 GF 아바타 업로드(5MB 파일)만 6MB, 나머지는 1MB다. 미디어는 브라우저가 presigned 양식으로 S3에 직접 올린다.

## 운영·롤백

각 릴리스에는 자기 버전의 운영 도구가 들어간다. 다음은 GF 예시이며 PC는 경로와 서비스 인자를 `photo-contest`로 바꾼다.

```sh
bash /srv/side-project/services/game-feedback/current/host/service.sh game-feedback status
bash /srv/side-project/services/game-feedback/current/host/service.sh game-feedback rollback
bash /srv/side-project/services/game-feedback/current/host/service.sh game-feedback prune
```

공용 DB는 저장소 체크아웃의 `database.sh`로 다룬다. `backup`은 배포 전 덤프와 같은 방식으로 수동 덤프를 올린다.

```sh
bash deploy/shared-instance/scripts/database.sh status
bash deploy/shared-instance/scripts/database.sh backup game-feedback
bash deploy/shared-instance/scripts/database.sh psql -d game_feedback
```

`prune`은 GF의 고아 미디어 정리다. PC의 파일·세션 정리는 기존 scheduler가 담당한다. GF 관리자는 일반 사용자와 별도인 ID·비밀번호 계정이다. 서버의 `operator create <admin-id>`·`operator reset-password <admin-id>`에 비밀번호를 stdin으로 전달한다(비밀번호 8–128자). 관리자 UI는 로컬에서 실행하며 `ssh -N -L 14300:127.0.0.1:4300 ...`로 API에 연결한 뒤 로그인한다. 절차는 [Admin README](../../projects/game-feedback/apps/admin/README.md)를 따른다. 로그인은 전용 HttpOnly 쿠키를 쓰며 공개 사용자 세션과 분리된다.

새 배포의 readiness가 실패하면 이전 API/Web 이미지로 복구한다. SQL은 되돌리지 않으므로 이전 앱과 호환되는 추가형 migration이 필요하다. 첫 배포 실패 시 그 서비스의 API/Web만 멈춘다. Caddy·공용 DB·S3는 유지한다. 여러 복제 API에 걸친 SSE 분배는 현재 범위에 포함하지 않으며 GF SSE는 프로세스 재시작 후 재연결한다.

오래된 이미지는 두 서비스가 모두 한 번 이상 성공한 뒤 아래 명령으로 정리한다. 네 서비스 이미지 저장소만 대상으로 하고 두 서비스의 current/previous digest, 최근 7일 이미지와 실행 중 컨테이너 이미지를 보존한다. 전역 `docker system prune`을 실행하지 않는다.

```sh
python3 /srv/side-project/services/game-feedback/current/host/prune-images.py
```

외부 모니터링은 GF `/api/health/ready`, PC `/backend/health/ready`를 확인한다. API `/health/live`(GF `/api/health/live`)와 각 Web `/health-check/live`는 DB 장애에서도 프로세스 생존을 확인한다. Web은 교체 직전 drain 파일이 생기면 503으로 전환하여 Caddy가 새 요청을 보류하게 하고, 3초 뒤 SIGTERM으로 처리 중 요청을 마친다. 새 컨테이너에서는 tmpfs의 drain 파일이 사라진다. 외부 readiness 모니터링과 알림 수신자를 별도로 등록해야 한다. 호스트가 멈추면 Sentry도 신호를 보내지 못하므로, Terraform은 인스턴스 상태 검사가 3분 연속 실패하면 재부팅하는 CloudWatch 알람과 CPU 크레딧 부족 알람을 함께 만든다(`alarm_email`로 메일 알림). 수동으로 구성했다면 [EC2 알람 동작 안내](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/UsingAlarmActions.html)대로 같은 알람을 만든다.

최초 배포 후 [GF workflow](https://github.com/jingeon27/side-project/actions/workflows/game-feedback.yml)와 [PC workflow](https://github.com/jingeon27/side-project/actions/workflows/photo-contest.yml)의 deploy 결과를 확인한다. 두 실제 도메인에서 홈, 공개 목록·상세, 로그인·로그아웃, 글 등록, 사진·영상 업로드, GF 채팅 송수신·재연결을 확인한다. 건강 상태는 아래 주소가 200인지 확인한다. DB 접속 장애를 운영에서 임의로 만들지 않는다.

| 서비스 | 공개 readiness URL                                 | Web liveness URL                           |
| ------ | -------------------------------------------------- | ------------------------------------------ |
| GF     | `https://game.bambyul.com/api/health/ready`        | `https://game.bambyul.com/_health/live`    |
| PC     | `https://contest.bambyul.com/backend/health/ready` | `https://contest.bambyul.com/_health/live` |

[Google Search Console](https://search.google.com/search-console/)에서 소유권을 확인하고 실제 서비스의 `/sitemap.xml`을 제출한다. GF는 운영 배포 후 `/robots.txt`, canonical, 사이트맵 URL이 운영 도메인을 사용하는지 먼저 확인한다.

## 백업·복구 연습

DB 백업은 두 겹이다.

| 백업                     | 만드는 시점                                        | 보존                                | 위치                                                    |
| ------------------------ | -------------------------------------------------- | ----------------------------------- | ------------------------------------------------------- |
| 논리 덤프(`pg_dump -Fc`) | 서비스 배포의 migration 직전, `database.sh backup` | backup 버킷 30일, 볼륨 `dumps/` 7일 | `s3://<backup>/postgres/<서비스>/<UTC 시각>-<sha>.dump` |
| EBS 스냅샷(DLM)          | 매일 02:00 KST                                     | 7개                                 | EC2 스냅샷                                              |

배포 도구는 덤프가 custom 형식(PGDMP)인지 확인하고 backup 버킷에 올린 뒤에만 migration을 시작한다. 업로드에 실패하면 배포를 멈춘다. 객체 위치·크기·SHA-256은 릴리스의 `pg-backup.json`에 남는다. 이 기록은 **백업 생성 확인**이며 복원 연습을 대신하지 않는다. EC2 역할은 덤프를 읽거나 지울 수 없으므로 복원용 다운로드는 운영자 자격 증명으로 한다.

스냅샷은 실행 중인 볼륨의 crash-consistent 사본이다. 데이터와 WAL이 같은 볼륨에 있어 복원하면 PostgreSQL이 WAL로 복구한다. 두 백업 사이의 변경은 최대 하루까지 잃을 수 있으며, RDS PITR처럼 임의 시각으로 되돌리는 기능은 없다.

1. 덤프 복원: 운영과 분리한 PostgreSQL 18(로컬 Docker 등)에 backup 버킷의 덤프를 `pg_restore --no-owner --dbname <검증 DB>`로 복원한다. 운영 DB를 덮어쓰지 않는다. [pg_restore 안내](https://www.postgresql.org/docs/18/app-pgrestore.html)를 따른다.
2. 스냅샷 복원: 최근 스냅샷으로 새 볼륨을 만들어 별도 인스턴스에 붙이고 PostgreSQL이 WAL 복구 후 시작하는지 확인한다. [스냅샷 볼륨 생성 안내](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-restoring-volume.html)를 따른다. 검증용 볼륨·인스턴스는 별도 요금이 발생하므로 확인 후 정리한다.
3. 별도 앱 환경에서 복원된 두 DB의 사용자·권한·게시물·댓글·채팅·첨부 참조가 맞는지 확인한다. DB 시점과 S3 버전을 맞춰 필요한 객체를 별도 검증 버킷에 복구한다. 실제 소요 시간, 복구 가능한 마지막 시각, S3 객체 일치 여부를 기록한다.
4. EC2만 교체할 때는 Terraform이 같은 데이터 볼륨을 새 인스턴스에 붙이고 첫 부팅이 포맷 없이 마운트한다. 볼륨이 손상됐다면 스냅샷에서 만든 볼륨으로 바꾼다. 같은 역할·버킷 접근, 환경 파일(`database/.env` 포함), Caddy 인증서 볼륨과 SSH/DNS 설정도 복원한다.

자동화가 버킷을 만들거나 운영 DB를 삭제하지 않는다. 스냅샷은 DLM 정책이 만들고 보존 개수를 넘으면 지운다. 실제 AWS IAM, 네트워크, 인증서 발급, 스냅샷·덤프 복원은 운영 리소스에서 확인해야 한다.

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

API 소유 통합 runner `projects/game-feedback/apps/api/scripts/shared-instance-smoke.ts`는 실제 두 API/Web 이미지·Caddy와 `prepare.sh`·`database.sh`로 띄운 공용 PostgreSQL 컨테이너를 실행한다. 미디어는 기존 AWS S3 버킷의 `<프로젝트 prefix>/tests/<실행 ID>/`에 직접 전송하며 S3 대역 컨테이너·인증서·DNS 별칭은 만들지 않는다. 업로드 전에 해당 prefix의 ListBucket 접근을 확인하고 종료 시 그 실행의 객체만 정리한다. backup 버킷 업로드와 registry 매핑은 계속 CLI fixture로 검사한다. 버킷 분리, DML/DDL 분리, Web의 DB 네트워크 차단, 배포 전 덤프와 업로드 실패 시 migration 차단, S3 파일/Range, 안전한 세션 쿠키, SSE 재연결, 한 서비스 실패 시 독립 롤백, 재시작 후 파일·DB 보존, liveness/readiness를 검사한다. 실제 운영 IAM 정책 변경·backup 버킷 전송·스냅샷을 검증했다는 뜻은 아니다. 필요한 실제 S3 키·CI Variables/Secrets·CORS·정리 권한은 [Game Feedback](../../projects/game-feedback/docs/media-upload.md#기본-로컬-실행)과 [Photo Contest](../../projects/photo-contest/docs/post-attachments.md#검증)의 테스트 설정을 따른다.

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

Photo Contest의 `/backend/graphql`은 pc-web의 Next Route Handler로 보내 공개 SEO·사이트맵 캐시 무효화를 수행한다. 나머지 `/backend/*`는 pc-api로 보낸다. Caddyfile이 바뀐 릴리스는 [공용 Caddyfile 동기화](#공용-caddyfile-동기화)로 반영한다. PC route 블록의 내부 경로 차단·GraphQL·일반 API·Web 순서를 유지한다.

## 재생성 동안의 요청과 호환성

Caddy route 블록은 내부·테스트·GF 관리자 경로를 프록시보다 먼저 차단한다. 차단 본문은 `edge-blocked`이며 관리자 앱은 기존 SSH 터널로 loopback API에 붙는다. 호스트 Caddyfile은 `proxy.sh sync`로 반영한다. 바인드 마운트 파일을 원자 교체하면 컨테이너에서 이전 inode를 볼 수 있어 에디터/rsync의 교체 방식으로 갱신하지 않는다.

모든 업스트림은 연결 실패를 250ms 간격으로 최대 140초 기다린다. 웹 요청을 먼저 종료 유예 30초 동안 마친 뒤 API 교체(종료 유예 20초 + 시작 구간 30초), 웹 시작 구간 20초를 순서대로 기다릴 여유를 뒀다. API를 먼저 내리면 진행 중인 SSR의 API 요청이 끊겨 이미 시작한 응답을 프록시가 재시도할 수 없다. 헬스체크 시작 구간은 API 30초/Web 20초이며 매초 검사한다. 재시도에서 모든 HTTP 메서드를 허용하도록 바꾸지 않는다. 연결 후 실패의 기본 GET 재시도 정책을 유지한다. 장시간 업로드·스트림·인프라 장애의 무중단을 보장하지 않는다. 종료 유예를 넘는 요청과 140초가 넘는 시작 실패는 사용자 오류가 될 수 있다. 교체 시 웹 종료 시간과 exit/OOM 상태를 기록하고, smoke가 실패하면 요청 경과 시간·교체 출력·웹 로그를 함께 남긴다.

service.sh는 같은 이미지도 실제로 재생성한다. API의 SSE는 종료 훅에서 닫고 클라이언트가 재연결한다. 공통 smoke는 서비스 스크립트로 두 서비스를 재배포하면서 실제 API/Web GET을 계속 보내 실패 수·최대 대기 시간을 기록하고 네 컨테이너 ID가 모두 바뀌었는지 검사한다. 실제 컨테이너 검증은 Docker가 있는 CI에서 수행한다.

## 확장 → 배포 → 정리

SQL은 되돌리지 않는다. 예를 들어 이름 변경은 (1) nullable 새 컬럼 추가와 이중 쓰기, (2) 새 컬럼 읽는 앱 배포와 이전 앱 종료 확인, (3) 보관 기간 후 옛 컬럼 정리로 나눈다. `node scripts/check-migrations.ts`(구현 `packages/toolkit`)는 기준 ref 이후 새로 추가된 migration.sql을 검사하고, 이미 있던 migration.sql의 수정·삭제·디렉터리 이동은 거부한다. 기존 migration의 위험 SQL을 다시 검사하지는 않는다. 실패하는 문장은 DROP TABLE/COLUMN/CONSTRAINT/INDEX와 VIEW·MATERIALIZED VIEW·TYPE·FUNCTION·PROCEDURE·SEQUENCE·SCHEMA·TRIGGER·EXTENSION·DOMAIN 삭제, DROP DEFAULT/IDENTITY/EXPRESSION, 컬럼 타입·NOT NULL 변경, RENAME(`ALTER INDEX ... RENAME TO` 제외), 기본값 없는 ADD COLUMN NOT NULL, TRUNCATE, WHERE 없는 DELETE·UPDATE, CONCURRENTLY 없는 CREATE INDEX, CREATE UNIQUE INDEX, ADD UNIQUE·PRIMARY KEY(`USING INDEX` 제외), NOT VALID 없는 ADD FOREIGN KEY·CHECK, 동적 SQL(EXECUTE, 작은따옴표 DO 본문)이다. DO 블록과 함수 본문 안의 문장도 같은 규칙으로 검사한다. 같은 migration에서 만든 테이블에 거는 인덱스·제약·컬럼은 빈 테이블이라 허용한다. Prisma가 넣은 `/* Warnings: ... */` 주석이 남아 있으면 실패하므로 검토하고 지운다. 정리 단계는 해당 문장 바로 앞 줄에 `-- migration-lint: allow DROP COLUMN — 이전 읽기 앱 종료 후 2주 경과`처럼 정확한 규칙명과 검토 가능한 사유를 쓴다. 허용 표시는 연속한 주석 줄로 쌓을 수 있고 바로 다음 문장 하나에만 적용한다. CI에서는 PR base SHA 또는 push의 before SHA를 기준으로 사용한다. before가 HEAD의 조상이 아니면(강제 push·새 브랜치 첫 push) `origin/develop`과의 merge-base(HEAD와 다를 때), 그다음 `origin/main`과의 merge-base를 기준으로 삼아 기능 브랜치는 develop에서 갈라진 뒤 더한 migration만 검사한다. 어느 기준도 HEAD와 다르지 않은 push는 실패한다. develop 자체를 강제 push하면 `origin/main` 기준으로 아직 배포되지 않은 migration 전체를 다시 검사하므로, main이 develop을 따라오기 전에는 강화한 규칙 이전의 기존 migration 때문에 실패할 수 있다.

## Next 컴파일 캐시

두 웹 빌드는 각각 gf-next-cache/pc-next-cache BuildKit mount를 사용한다. shared-instance workflow는 SHA 키와 OS restore prefix의 Actions cache, 고정 커밋의 cache-dance로 mount를 복원·추출한다. 기존 GHA 이미지 레이어 캐시도 유지한다. 같은 브랜치의 두 번째 소스 변경 빌드에서 캐시 복원 로그와 Next 컴파일 시간을 비교한다. 캐시를 적용했다고 실제 속도 향상을 측정한 것으로 간주하지 않는다. 저장 한도·보존 정책은 GitHub 설정을 따른다.

## Bambyul DNS와 클라이언트 설정

- `game.bambyul.com`, `api.game.bambyul.com`, `contest.bambyul.com`, `api.contest.bambyul.com`의 A/AAAA 레코드를 같은 EC2 고정 주소로 연결한다. Caddy가 각 호스트의 TLS 인증서를 발급한다.
- `host.env.example`의 네 DOMAIN 값을 복사하고 `proxy.sh validate` 후 시작한다. API 주소는 `api.<웹 도메인>` 규칙이며 네 호스트는 서로 달라야 한다.
- GitHub Variables의 `GAME_FEEDBACK_SITE_URL`은 `https://game.bambyul.com`, `PHOTO_CONTEST_SITE_URL`은 `https://contest.bambyul.com`으로 지정한다. 빌드·통합 검사의 기본 운영 origin도 이 값이다. CI HTTPS 요청은 loopback·테스트 CA를 사용하므로 실제 DNS나 운영 서버에 연결하지 않는다.
- 모바일 release의 `EXPO_PUBLIC_WEB_ORIGIN`은 각 앱의 `.env.production.example`을 참고한다. 앱 이름·홈 화면 아이콘은 네이티브 앱을 새로 빌드해야 반영된다.
