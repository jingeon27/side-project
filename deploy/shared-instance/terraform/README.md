# 공용 배포 환경 Terraform

[공통 EC2 배포](../README.md)가 요구하는 AWS 리소스(서울 리전의 EC2 한 대 + PostgreSQL 데이터 EBS 볼륨과 일일 스냅샷 + DB 덤프용 비공개 S3 버킷)를 **새로** 만든다. 기존 리소스를 import하지 않는다. PostgreSQL 컨테이너와 서비스별 DB·role, 서버 환경 파일, 프록시, GitHub 설정은 Terraform 밖의 기존 절차를 그대로 따른다.

## 만드는 리소스

| 영역       | 리소스                                                                                                                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 네트워크   | VPC, 인터넷 게이트웨이, 공개 서브넷 1개(EC2), 라우팅 테이블. NAT 게이트웨이는 없다                                                                                                                                            |
| 보안       | EC2 보안 그룹(80/443 전체, 22는 `ssh_allowed_cidrs`만, PostgreSQL 5432는 열지 않는다), 규칙을 비운 기본 보안 그룹                                                                                                             |
| EC2        | Ubuntu 24.04 LTS x86_64, 암호화 gp3 루트 볼륨, IMDSv2 필수, 네트워크 인터페이스 + 탄력적 IP, cloud-init(Docker·Compose·도구, `/srv/side-project`, PostgreSQL 볼륨 포맷·마운트)                                                |
| PostgreSQL | EC2와 같은 AZ의 암호화 gp3 EBS 볼륨(교체·파기 시 최종 스냅샷), 인스턴스를 멈춘 뒤에만 분리하는 attachment, DLM 일일 스냅샷(7개 보존). 컨테이너·DB·role은 `database.sh`가 만든다                                               |
| S3         | DB 덤프용 backup 버킷 1개: 퍼블릭 접근 차단, BucketOwnerEnforced, SSE-S3, Versioning, 수명 주기, TLS 아닌 요청 거부 정책. 두 서비스가 함께 쓰는 미디어 버킷은 **만들거나 설정하지 않고** 이름(`media_bucket_name`)만 참조한다 |
| IAM        | EC2 역할·인스턴스 프로파일(backup 버킷 `postgres/`의 PutObject, 선택적으로 SSM), DLM 서비스 역할, 서비스별 S3 사용자 2개(공용 버킷의 자기 `<서비스>/production/` 폴더만). **액세스 키는 만들지 않는다**                       |
| 모니터링   | 인스턴스 상태 검사가 1분 단위 3번 연속 실패하면 재부팅하는 CloudWatch 알람, CPU 크레딧 부족 알람, 선택적으로 SNS 메일 알림(`alarm_email`)                                                                                     |
| DNS        | `route53_zone_id`가 있을 때만 네 호스트의 A 레코드                                                                                                                                                                            |

설정은 [`s3-public-access.json`](../s3-public-access.json), [`s3-lifecycle.json`](../s3-lifecycle.json), [`s3-app-policy.json`](../s3-app-policy.json), [`backup-write-policy.json`](../backup-write-policy.json)을 backup 버킷과 서비스 IAM 사용자용 HCL로 옮긴 것이다. JSON을 바꾸면 같은 커밋에서 여기도 맞춘다. 공용 미디어 버킷의 차단·수명 주기·CORS(두 프로젝트의 `s3-cors.json`)는 Terraform이 아니라 콘솔에서 적용한다. backup 버킷 수명 주기는 공용 버킷과 달리 `postgres/` 덤프를 `postgres_dump_retention_days` 뒤 만료한다.

## 비용에 영향을 주는 기본값

아래 금액은 서울 리전 온디맨드 기준 **대략치**이며 트래픽·S3 저장량은 빠져 있다. 적용 전에 [AWS Pricing Calculator](https://calculator.aws/)로 확인한다.

| 변수·설정                              | 기본값                       | 영향                                                                                                                                                |
| -------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `instance_type`                        | `t3.small`(2 vCPU, 2GiB)     | 약 월 $19. 컨테이너 한도 합계 약 3.1GiB는 상한이므로 사용자가 적은 동안 swap과 함께 쓴다. 메모리가 모자라면 `t3.medium`(4GiB, 약 월 $38)으로 올린다 |
| `instance_cpu_credits`                 | `standard`                   | 크레딧 소진 시 기준 성능으로 제한, 추가 요금 없음. `unlimited`는 초과 사용 과금                                                                     |
| `root_volume_size_gib`                 | 30(gp3)                      | 약 월 $3                                                                                                                                            |
| `postgres_volume_size_gib`             | 20(gp3)                      | 약 월 $2. 늘릴 수는 있어도 줄일 수 없다                                                                                                             |
| `postgres_snapshot_retention_count`    | 7                            | 증분 스냅샷이라 바뀐 블록만 과금(GB당 월 $0.05 안팎)                                                                                                |
| 탄력적 IP                              | 1개                          | 공인 IPv4 요금 약 월 $3.6                                                                                                                           |
| `postgres_dump_retention_days`         | 30                           | 배포마다 쌓이는 덤프 저장 요금. DB가 작은 동안은 미미하다                                                                                           |
| `s3_noncurrent_version_retention_days` | 30                           | 삭제·덮어쓴 객체를 30일 보존한 만큼 저장 요금                                                                                                       |
| CloudWatch 알람 2개                    | 상태 검사 재부팅, CPU 크레딧 | 알람당 월 약 $0.1. 무료 사용량(알람 10개) 안이면 0                                                                                                  |
| NAT 게이트웨이·VPC 엔드포인트          | 만들지 않음                  | 시간당·처리량 요금 없음                                                                                                                             |

합계는 대략 월 $28 안팎이다(`t3.medium`이면 약 $47).

## 준비물과 권한

- Terraform 1.16 이상(CI는 1.16.6), AWS CLI v2, [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html), `gh`(GitHub 설정용).
- 운영 계정에서 VPC·EC2·EBS·DLM·CloudWatch·SNS·S3·IAM·Route 53(선택)을 만들 수 있는 **단기 자격 증명**(IAM Identity Center 등)을 쓴다. 장기 액세스 키를 저장소나 셸 기록에 남기지 않는다. `plan`도 SSM 파라미터·AMI·인스턴스 타입·호스팅 영역을 조회하므로 자격 증명이 필요하다. 재부팅 알람을 처음 만들 때 CloudWatch가 서비스 연결 역할 `AWSServiceRoleForCloudWatchEvents`를 만들므로 `iam:CreateServiceLinkedRole` 권한도 필요하다.
- `terraform.tfvars`, `backend.hcl`, state, plan 파일은 커밋하지 않는다([`.gitignore`](.gitignore)). `.terraform.lock.hcl`은 커밋한다. provider를 올릴 때는 `terraform init -upgrade` 후 `terraform providers lock -platform=linux_amd64 -platform=darwin_arm64 -platform=darwin_amd64`로 세 플랫폼 해시를 갱신한다.

### state 버킷 준비(한 번, 이 구성 밖)

state에는 비밀이 없도록 구성했지만(액세스 키·DB 비밀번호를 만들지 않는다) 리소스 ID와 구성이 들어 있으므로 비공개·암호화·버전 관리 버킷에 둔다. 서비스·backup 버킷과 다른 이름을 쓰고 저장소 루트에서 실행한다.

```sh
STATE_BUCKET=your-terraform-state-bucket
aws s3api create-bucket --bucket "$STATE_BUCKET" --region ap-northeast-2 \
  --create-bucket-configuration LocationConstraint=ap-northeast-2
aws s3api put-public-access-block --bucket "$STATE_BUCKET" \
  --public-access-block-configuration file://deploy/shared-instance/s3-public-access.json
aws s3api put-bucket-ownership-controls --bucket "$STATE_BUCKET" \
  --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
aws s3api put-bucket-encryption --bucket "$STATE_BUCKET" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-bucket-versioning --bucket "$STATE_BUCKET" --versioning-configuration Status=Enabled
```

잠금은 S3 native lock(`use_lockfile = true`, `<key>.tflock` 객체)을 쓰므로 DynamoDB 테이블이 필요 없다. Terraform을 실행하는 주체에는 state 키와 `.tflock` 객체의 `s3:GetObject`·`s3:PutObject`·`s3:DeleteObject`, 버킷의 `s3:ListBucket`이 필요하다.

## 적용 순서

명령은 저장소 루트에서 `cd deploy/shared-instance/terraform` 한 뒤 실행한다. 리소스 이름은 기본 `name_prefix`(`side-shared`) 기준이다.

### 1. backend·변수 파일

```sh
cp backend.hcl.example backend.hcl            # bucket을 state 버킷으로 바꾼다
cp terraform.tfvars.example terraform.tfvars  # 버킷 이름 세 개와 필요한 값을 넣는다
```

결정할 것:

- **버킷 이름**: 점(.) 없이. `media_bucket_name`은 이미 있는 공용 비공개 버킷이고 퍼블릭 접근 차단·암호화·Versioning·수명 주기·CORS를 [공통 운영 가이드](../README.md)대로 콘솔에서 관리한다. Terraform이 만드는 `backup_bucket_name`은 전역 고유하고 공용 버킷과 달라야 하며, 만든 뒤 바꾸면 버킷이 교체된다.
- **AZ**: `availability_zone`에 EC2와 PostgreSQL 볼륨을 함께 둔다. EBS 볼륨은 같은 AZ의 인스턴스에만 붙으므로 만든 뒤 바꾸지 않는다.
- **`metadata_hop_limit`**: `scripts/pg-backup.sh`는 aws-cli를 `--network host`로 실행하므로 기본 `1`로 덤프를 올린다. `2`로 올리면 bridge 네트워크의 앱 컨테이너도 인스턴스 역할을 쓸 수 있다.
- **SSM 배포 runner**: `github_oidc_subjects`에 정확한 두 운영 Environment의 subject를 넣으면 GitHub OIDC provider와 CD 역할, 이 EC2의 `AWS-StartSSHSession`만 허용하는 정책을 만든다(리소스 3개 추가). GitHub Environment의 배포 브랜치는 반드시 `main`만 허용한다. runner는 OIDC 임시 자격증명으로 SSM 터널을 열고 기존 SSH 인증·호스트 키 검증으로 배포한다. `ssh_allowed_cidrs = []`를 유지해 외부 22번을 열지 않는다. 이 계정에 GitHub OIDC provider가 이미 있다면 새로 만들지 말고 `aws_iam_openid_connect_provider.github[0]`로 import한 뒤 계획을 검토한다. 직접 SSH 배포도 계속 지원하며 이 경우에만 고정 IP runner의 출구 CIDR을 따로 허용한다.
- **알람 메일**: `alarm_email`을 넣으면 상태 검사 재부팅과 CPU 크레딧 부족을 메일로 받는다. 비워 두면 재부팅만 하고 알리지 않는다.
- **DNS**: Route 53 호스팅 영역이 있으면 `route53_zone_id`를 넣는다. 같은 이름의 레코드가 이미 있으면 덮어쓰지 않고 실패한다.
- **계정 고정**: `allowed_account_ids`에 운영 계정 ID를 넣어 다른 계정에 만드는 사고를 막는다.

### 2. init → plan → apply

```sh
terraform init -backend-config=backend.hcl
terraform plan -out=tfplan
terraform apply tfplan
terraform output
```

기본값의 plan은 36개 리소스를 만든다(SSH 규칙·키 페어·DNS 레코드·알람 메일 SNS 제외). `alarm_email`을 넣었다면 적용 뒤 AWS Notifications가 보낸 확인 메일의 링크를 눌러야 알림이 온다. `aws_instance`·`aws_ebs_volume`·`aws_s3_bucket` 속성을 검토한다.

### 3. 호스트 확인

```sh
$(terraform output -raw ssm_session_command)
# 세션 안에서
cloud-init status --wait
cat /var/lib/side-project/host-bootstrap.done     # docker=…, compose=…
findmnt /srv/side-postgres                         # PostgreSQL 볼륨(ext4)
cat /srv/side-postgres/.side-postgres-volume       # volume=vol-…(terraform output postgres_volume_id)
sudo -iu ubuntu                                    # 이후 작업은 배포 사용자로
```

cloud-init 실패 시 `/var/log/cloud-init-output.log`를 본다. 볼륨 연결은 인스턴스 생성 뒤에 일어나므로 첫 부팅이 최대 10분까지 기다린다. SSM 세션은 `ssm-user`로 시작하므로 `/srv/side-project` 작업은 `ubuntu`로 전환해서 한다. user_data는 첫 부팅에만 실행되며 비밀을 담지 않는다.

### 4. DNS

`dns_managed_by_terraform`이 `false`면 `terraform output dns_records`의 네 A 레코드를 DNS 공급자에 만든다. AAAA는 만들지 않는다(이 VPC는 IPv4만 쓴다). 프록시를 시작하기 전에 네 이름이 탄력적 IP를 가리켜야 Caddy가 인증서를 받는다.

### 5. 비밀 발급(Terraform 밖)

| 비밀                           | 발급                                                                  | 넣는 곳                                                                                             |
| ------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| GF S3 액세스 키                | `aws iam create-access-key --user-name side-shared-game-feedback-s3`  | `/srv/side-project/services/game-feedback/.env`의 `GF_S3_ACCESS_KEY_ID`·`GF_S3_SECRET_ACCESS_KEY`   |
| PC S3 액세스 키                | `aws iam create-access-key --user-name side-shared-photo-contest-s3`  | `/srv/side-project/services/photo-contest/.env`의 `PC_AWS_ACCESS_KEY_ID`·`PC_AWS_SECRET_ACCESS_KEY` |
| 서비스 DB 비밀번호 4개         | `openssl rand -base64 36` 등으로 서로 다른 32자 이상                  | 6단계 `\password` 프롬프트, 7단계 DB URL 두 개(GF는 `DATABASE_*`, PC는 `PC_DATABASE_*`, URL 인코딩) |
| `GF_CACHE_REVALIDATION_SECRET` | `openssl rand -hex 32`                                                | GF 서비스 `.env`                                                                                    |
| 배포용 SSH 키                  | `ssh-keygen -t ed25519 -N '' -C github-actions-deploy -f side-deploy` | 공개 키는 호스트 `/home/ubuntu/.ssh/authorized_keys`, 개인 키는 9단계 GitHub Secret                 |
| OAuth·Supercell·Sentry         | 각 공급자 콘솔                                                        | 서비스별 `.env`                                                                                     |

PostgreSQL superuser 비밀번호는 `prepare.sh`가 `/srv/side-project/database/.env`에 만들며 initdb에만 쓰인다. `pg_hba.conf`가 네트워크의 superuser 로그인을 거부하므로 따로 발급하거나 보관하지 않는다.

액세스 키는 출력이 로그·공유 화면에 남지 않는 단말에서 발급해 서버 파일에 바로 옮긴다. 키를 Terraform으로 만들지 않는 이유는 비밀 키가 state에 평문으로 남기 때문이다. 배포 시 `verify-services.ts`는 자기 폴더 목록 조회(ListObjectsV2)만 확인하므로, 한쪽 키로 다른 서비스 폴더가 거부되는지는 직접 확인한다.

```sh
# 예: GF 키로 PC 폴더 목록이 거부되는지(AccessDenied 기대). 키는 셸 기록에 남기지 않도록 프롬프트로 읽는다.
read -rs AWS_ACCESS_KEY_ID; read -rs AWS_SECRET_ACCESS_KEY; export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
aws s3api list-objects-v2 --max-items 1 --bucket "$(terraform output -raw media_bucket_name)" \
  --prefix "$(terraform output -json s3_key_prefixes | python3 -c 'import json,sys; print(json.load(sys.stdin)["photo-contest"])')/"
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
```

### 6. 호스트 파일과 DB 초기화

`ubuntu` 사용자로 저장소를 체크아웃하고 `prepare.sh`를 실행한다. `/srv/side-project`는 cloud-init이 이미 만들었다(`ubuntu` 소유, 700). 이어서 PostgreSQL을 시작하고 새 클러스터에 [`bootstrap.sql`](../database/bootstrap.sql)을 **한 번** 적용한다. 각 `\password`에 5단계의 서비스 DB 비밀번호를 입력한다.

```sh
git clone https://github.com/jingeon27/side-project.git ~/side-project && cd ~/side-project
bash deploy/shared-instance/scripts/prepare.sh
bash deploy/shared-instance/scripts/database.sh start
bash deploy/shared-instance/scripts/database.sh bootstrap
```

`database.sh`는 `/srv/side-postgres`에 볼륨 표시 파일이 없으면(볼륨이 마운트되지 않았으면) 시작하지 않는다. psql은 컨테이너 안의 PostgreSQL 18 클라이언트를 쓰므로 호스트에 설치하지 않는다.

### 7. 서버 환경 파일

- `/srv/side-project/.env`: `terraform output -raw host_env`의 값(`BACKUP_BUCKET`·`BACKUP_REGION` 포함)으로 바꾸고 `ACME_EMAIL`은 확인해 둔다.
- 서비스별 `.env` 초안: GF의 `DATABASE_URL`·`DATABASE_MIGRATION_URL`, PC의 `PC_DATABASE_URL`·`PC_DATABASE_MIGRATION_URL`에 있는 `REPLACE`(URL 인코딩한 비밀번호), S3 키, 나머지 비밀을 채운다. 호스트는 `shared-postgres`를 그대로 둔다. 모두 `chmod 600`이며 Git·Actions 로그에 올리지 않는다.

이어서 [공통 EC2 배포](../README.md#프록시와-github-actions)대로 `proxy.sh validate` → `proxy.sh start`를 실행한다.

### 8. 배포 runner 접속 경로

배포용 공개 키를 `/home/ubuntu/.ssh/authorized_keys`에 추가하고, GitHub-hosted runner를 쓰면 `ssh_allowed_cidrs`로 22번을 연 상태인지 확인한다(1단계).

### 9. GitHub Environment 변수·비밀

`game-feedback-production`(Game Feedback)과 `photo-contest-production`(Photo Contest) Environment는 이미 있고 배포 브랜치는 `main`이다. 두 Environment에 같은 값을 넣는다. 기준은 [Services workflow](../../../.github/workflows/services.yml)의 GF deploy·PC deploy 작업에서 사용하는 `vars.*`·`secrets.*`다.

| 종류     | 이름                          | 값                                                                                  |
| -------- | ----------------------------- | ----------------------------------------------------------------------------------- |
| Variable | `SIDE_DEPLOY_HOST`            | `terraform output -raw public_ip`(탄력적 IP)                                        |
| Variable | `SIDE_DEPLOY_SSH_USER`        | `ubuntu`(`ssh_user` 출력)                                                           |
| Variable | `SIDE_DEPLOY_SSH_PORT`        | `22`                                                                                |
| Variable | `SIDE_DEPLOY_SSH_KNOWN_HOSTS` | 아래 명령으로 AWS API에서 읽은 host key. 검증 없는 `ssh-keyscan` 결과를 쓰지 않는다 |
| Secret   | `SIDE_DEPLOY_SSH_KEY`         | 5단계 배포용 SSH 개인 키 전체                                                       |

```sh
HOST=$(terraform output -raw public_ip)
aws ec2 get-console-output --region ap-northeast-2 --instance-id "$(terraform output -raw instance_id)" \
  --latest --output text | tr -d '\r' \
  | sed -n '/BEGIN SSH HOST KEY KEYS/,/END SSH HOST KEY KEYS/p' \
  | awk -v host="$HOST" '$1 ~ /^(ssh-ed25519|ecdsa-sha2-nistp256)$/ { print host, $1, $2 }' >known_hosts
# SSM 세션에서 ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub 지문과 비교한 뒤 등록한다.
for env in game-feedback-production photo-contest-production; do
  gh variable set SIDE_DEPLOY_HOST --env "$env" --body "$HOST"
  gh variable set SIDE_DEPLOY_SSH_USER --env "$env" --body ubuntu
  gh variable set SIDE_DEPLOY_SSH_PORT --env "$env" --body 22
  gh variable set SIDE_DEPLOY_SSH_KNOWN_HOSTS --env "$env" <known_hosts
  gh secret set SIDE_DEPLOY_SSH_KEY --env "$env" <side-deploy
done
```

콘솔 출력의 host key는 부팅 몇 분 뒤에 읽힌다. 다음은 job 조건(`if`)과 빌드에서 읽으므로 Environment가 아니라 **repository variable**로 둔다.

| 이름                                                             | 값                                            |
| ---------------------------------------------------------------- | --------------------------------------------- |
| `GAME_FEEDBACK_SITE_URL`                                         | `https://game.bambyul.com`                    |
| `GAME_FEEDBACK_CONTACT_EMAIL`                                    | `contact@bambyul.com`                         |
| `PHOTO_CONTEST_SITE_URL`                                         | `https://contest.bambyul.com`                 |
| `PHOTO_CONTEST_DEPLOY_BRANCH`                                    | `main`(Environment 배포 브랜치와 같아야 한다) |
| `GAME_FEEDBACK_WEB_SENTRY_DSN`·`GAME_FEEDBACK_AMPLITUDE_API_KEY` | 선택                                          |
| `PHOTO_CONTEST_WEB_SENTRY_DSN`·`PHOTO_CONTEST_AMPLITUDE_API_KEY` | 선택                                          |
| `GAME_FEEDBACK_DEPLOY_ENABLED`·`PHOTO_CONTEST_DEPLOY_ENABLED`    | 마지막에 `true`                               |

`*_DEPLOY_ENABLED`는 프록시·환경 파일·복구 연습을 마친 뒤에 켠다. DB·S3·OAuth 비밀은 각 production Environment의 `SERVICE_ENV` Secret에 해당 서비스 운영 `.env` 전체 내용으로 등록한다. 기존 DB role 비밀번호를 유지하며, CD가 서버 파일에 반영한다. [운영 환경 파일 관리](../README.md#운영-환경-파일의-위치)를 따른다.

## 기존 수동 절차와의 관계

[공통 EC2 배포](../README.md)의 "AWS에서 먼저 준비할 것" 1~5를 이 구성이 대신한다.

| 수동 절차                                                       | Terraform                                               | 남는 수동 작업                                            |
| --------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| 1. EC2·고정 IP·DNS·Docker 등 도구·SSH                           | `compute.tf`, `security.tf`, `dns.tf`(선택), cloud-init | Route 53 밖 DNS, SSH 공개 범위 결정, 배포 키 등록         |
| 2. PostgreSQL 볼륨·마운트·일일 스냅샷                           | `database.tf`, cloud-init                               | `database.sh start`·`bootstrap`, 마이그레이션 호환성 확인 |
| 3. EC2 역할의 backup 쓰기 정책, hop limit                       | `iam.tf`, `metadata_hop_limit`                          | 없음                                                      |
| 4. backup 버킷·차단·암호화·Versioning·수명 주기, 공용 버킷 참조 | `storage.tf`                                            | 공용 버킷 설정·CORS는 콘솔                                |
| 5. 서비스별 IAM 자격 증명                                       | `iam.tf`의 사용자·정책                                  | 액세스 키 발급과 교차 접근 거부 확인                      |

## 운영 중 변경

- 새 AMI가 게시되거나 `user_data`·`ssh_public_key`가 바뀌어도 EC2를 교체하지 않는다(`ignore_changes`). 호스트를 새로 만들려면 `terraform apply -replace=aws_instance.host`로 명시한다. 탄력적 IP는 네트워크 인터페이스에, PostgreSQL 볼륨은 별도 리소스로 남는다. 기존 인스턴스를 멈춘 뒤 볼륨을 떼어 새 인스턴스에 붙이고, 첫 부팅이 포맷 없이 다시 마운트한다. 루트 볼륨(이미지·Caddy 인증서·`/srv/side-project`)과 SSH host key는 새로 만들어지므로 3·7·9단계를 다시 하고, 6단계는 `prepare.sh`와 `database.sh start`만 실행한다(`bootstrap`은 다시 하지 않는다). 새로 생긴 `database/.env`는 initdb에만 쓰이므로 기존 클러스터에 영향이 없다.
- `instance_type` 변경은 인스턴스를 멈췄다 켜며 적용된다(짧은 중단). `postgres_volume_size_gib` 증가는 운영 중에 적용되며, 이후 서버에서 파일 시스템을 넓힌다([공통 EC2 배포](../README.md#호스트-파일과-db-초기화) 참고).
- `name_prefix`·버킷 이름·`vpc_cidr`·`availability_zone`을 바꾸면 해당 리소스가 교체된다. `availability_zone`은 PostgreSQL 볼륨까지 교체하므로 최종 스냅샷에서 복원해야 한다. plan의 `must be replaced`를 반드시 확인한다.
- 오프라인 검사: `terraform fmt -check -recursive`, `terraform init -backend=false`, `terraform validate`, `terraform test`(mock provider, AWS 호출 없음). CI는 [`.github/workflows/terraform.yml`](../../../.github/workflows/terraform.yml)에서 같은 검사를 한다.

## 파기 시 주의

`terraform destroy`는 운영 DB와 미디어를 지운다. 백업을 확인한 뒤에만 한다.

1. `bash deploy/shared-instance/scripts/database.sh backup <서비스>`로 두 서비스의 마지막 덤프를 backup 버킷에 남긴다.
2. `instance_termination_protection = false`로 apply한다. 종료 방지가 켜져 있으면 destroy가 실패한다.
3. PostgreSQL 볼륨은 `final_snapshot = true`라 삭제 전에 최종 스냅샷을 남긴다. DLM 정책을 지워도 그 정책이 만든 일일 스냅샷은 남는다. 둘 다 요금이 붙으므로 필요 없어지면 직접 지운다.
4. S3 버킷은 `force_destroy = false`라 객체가 남아 있으면 지우지 않는다(backup 버킷 포함). Versioning 버킷은 모든 이전 버전과 삭제 마커까지 비워야 삭제된다(복구 불가). 버킷을 남기려면 `terraform state rm aws_s3_bucket.backup` 등으로 관리 대상에서 먼저 뺀다. 공용 미디어 버킷은 Terraform이 관리하지 않으므로 destroy에 영향을 받지 않는다.
5. 서비스 IAM 사용자에 콘솔·CLI로 발급한 액세스 키가 있으면 삭제가 실패한다. 키를 먼저 비활성화·삭제한다.
6. 탄력적 IP가 해제되면 같은 주소를 다시 받을 수 없다. DNS와 `SIDE_DEPLOY_HOST`·known_hosts를 갱신한다.
7. state 버킷은 이 구성 밖이므로 남는다.

## 2026-10-26 재검토와 로컬 실행 구분

RDS를 EC2 안의 PostgreSQL 컨테이너로 바꾼 뒤 Terraform 1.16.6에서 fmt 검사, backend 비활성 init, validate와 mock provider plan 사양 13개가 통과했다. 실제 AWS 계정의 plan/apply와 첫 부팅의 볼륨 마운트는 실행하지 않았다. 이 모듈은 Game Feedback·Photo Contest의 공용 호스트를 만들며 블로그 서비스는 구성하지 않는다.

새 배포 전 운영자가 준비할 값은 다음과 같다. 리소스 생성 후 얻는 값과 직접 정해야 할 값을 구분한다.

| 준비할 것                         | 입력 또는 출력                                                                                                                                                                                                                                       | 용도                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 단기 AWS 자격 증명·12자리 계정 ID | AWS profile, allowed_account_ids                                                                                                                                                                                                                     | 운영 계정 고정·Terraform 실행                                               |
| 별도 state 버킷                   | backend.hcl의 bucket                                                                                                                                                                                                                                 | 암호화·버전 관리·use_lockfile; 서비스 미디어 버킷과 별개                    |
| 공용 버킷과 backup 버킷 이름      | media_bucket_name(기존 버킷), backup_bucket_name                                                                                                                                                                                                     | Terraform이 서비스 폴더 IAM 사용자와 backup 버킷을 생성(공용 버킷은 참조만) |
| 웹 도메인·DNS 권한                | game_feedback_domain, photo_contest_domain, 선택 route53_zone_id                                                                                                                                                                                     | 웹·API 네 A 레코드를 public_ip로 연결                                       |
| 운영자·배포 키와 접속 경로        | ssh_public_key, ssh_allowed_cidrs, SSM                                                                                                                                                                                                               | 기본 ssh_allowed_cidrs=[]이면 현재 SSH 기반 Actions CD는 접속할 수 없음     |
| DB 초기화·서비스 비밀번호         | postgres_volume_id; `database.sh start`·`bootstrap`(database/bootstrap.sql)                                                                                                                                                                          | 서비스별 runtime/migrator 자격 증명 분리, superuser는 컨테이너 socket 전용  |
| 서비스별 S3 키·캐시 비밀          | s3_iam_user_names, 별도 create-access-key, GF_CACHE_REVALIDATION_SECRET                                                                                                                                                                              | 앱의 서버 환경 파일에 저장; Terraform은 액세스 키를 만들지 않음             |
| 앱 링크 식별값                    | MOBILE_APPLE_TEAM_ID, MOBILE_IOS_BUNDLE_ID, MOBILE_ANDROID_PACKAGE, MOBILE_ANDROID_SHA256_FINGERPRINTS                                                                                                                                               | 현재 production 웹은 이 값이 없으면 시작 검증에서 실패                      |
| 외부 서비스 설정                  | OAuth 제공자 키·callback, 선택 Supercell·Amplitude·Sentry                                                                                                                                                                                            | 해당 기능을 사용할 때만 설정; Supercell 허용 IP에는 서버의 public_ip 사용   |
| GitHub 배포 설정                  | Environment의 `SIDE_DEPLOY_HOST`, `SIDE_DEPLOY_SSH_*`; repository의 `GAME_FEEDBACK_SITE_URL`, `GAME_FEEDBACK_CONTACT_EMAIL`, `PHOTO_CONTEST_SITE_URL`, `PHOTO_CONTEST_DEPLOY_BRANCH`, `GAME_FEEDBACK_DEPLOY_ENABLED`, `PHOTO_CONTEST_DEPLOY_ENABLED` | 위 단계와 복구 검증 후 활성화                                               |

로컬 개발은 AWS 자격 증명 없이 실행할 수 있다. Photo Contest는 .env.example의 로컬 S3 대역과 개발 DB를 사용하고 새 migration을 적용한다. Game Feedback의 dev:test는 테스트 계정으로 확인하며 일반 개발에서는 실제 로그인 제공자 설정이 선택이다. 모바일 앱 링크 식별값과 분석 키는 development에서 비워 둘 수 있다. 실제 AWS 계정 권한·리소스 가용성과 애플리케이션 환경 파일은 mock test가 검증하지 않는다.

적용 전 선택한 AZ에서 인스턴스 타입을 제공하는지 확인한다. 아래 마지막 명령의 결과가 비어 있으면 그 AZ에서 `t3.small`을 만들 수 없으므로 다른 AZ나 타입을 고른 뒤 plan을 검토한다. mock provider는 이 가용성을 확인하지 않는다.

```sh
aws sts get-caller-identity
aws ec2 describe-instance-type-offerings --region ap-northeast-2 --location-type availability-zone \
  --filters Name=location,Values=ap-northeast-2a Name=instance-type,Values=t3.small \
  --query "InstanceTypeOfferings[].InstanceType" --output text
```

관련 공식 문서: [EBS 볼륨 연결](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-attaching-volume.html), [Data Lifecycle Manager 스냅샷 정책](https://docs.aws.amazon.com/ebs/latest/userguide/snapshot-lifecycle.html), [S3 CORS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html), [Terraform S3 backend 잠금](https://developer.hashicorp.com/terraform/language/backend/s3), [EC2 Elastic IP](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/elastic-ip-addresses-eip.html).

## SSM CD 연결

1. `terraform.tfvars.example`의 `github_oidc_subjects`를 채운다. GitHub API `GET /repos/<owner>/<repo>/actions/oidc/customization/sub`의 `sub_claim_prefix` 뒤에 `:environment:game-feedback-production`와 `:environment:photo-contest-production`을 각각 붙인다. 와일드카드는 허용하지 않는다.
2. GitHub의 두 운영 Environment에서 배포 브랜치 정책을 **main 브랜치 하나**로 제한한다. Environment subject에는 브랜치가 없으므로 이 제한이 필수다.
3. Terraform plan에서 기존 EC2·볼륨 교체가 없는지 확인하고 apply한다. CD 역할에는 이 인스턴스의 SSH 세션과 `side-cd-` 이름의 세션 채널만 허용하며 SendCommand, 일반 SSM 셸, S3, DB 권한은 주지 않는다.
4. `github_cd_role_arn`을 두 GitHub Environment의 `SIDE_DEPLOY_AWS_ROLE_ARN`에, `github_cd_instance_id`를 `SIDE_DEPLOY_SSM_INSTANCE_ID`에, AWS 계정 ID를 `SIDE_DEPLOY_AWS_ACCOUNT_ID`에 넣는다. 기존 `SIDE_DEPLOY_HOST`에는 고정 공인 IP, `SIDE_DEPLOY_SSH_USER`에는 `ubuntu`를 유지한다.
5. 별도의 배포용 SSH 키를 만들고 공개 키를 서버 `ubuntu`의 `~/.ssh/authorized_keys`에 추가한다. 비밀키는 두 Environment의 Secret `SIDE_DEPLOY_SSH_KEY`에만 저장한다. 서버의 SSH 공개 host key를 SSM으로 읽고 고정 IP를 붙여 Variable `SIDE_DEPLOY_SSH_KNOWN_HOSTS`에 넣는다. SSM 터널에서도 이 검증을 생략하지 않는다.
6. CI는 SHA로 고정한 AWS credentials action과 버전·SHA256으로 고정한 Session Manager plugin을 사용한다. 장기 AWS access key를 CD Secret으로 추가하지 않는다. 서비스 운영 `.env`는 각 Environment의 `SERVICE_ENV` Secret에서 SSH/SSM 표준입력으로 전달한다. 검사·migration 후 서버 파일을 원자 교체하며 시작 실패 시 이전 파일을 복원한다. 공통 호스트·DB 초기화 `.env`는 서버에서 관리한다.
7. 로컬에서 SSM 터널의 SSH 접속을 확인한 뒤 두 서비스의 `*_DEPLOY_ENABLED=true`를 설정한다. main 반영은 운영자가 수행한다. main push 후 전체 서비스 검사와 이미지 검증이 통과해야 CD가 실행된다.

GitHub OIDC의 실제 토큰 교환과 최초 앱 배포는 main 실행에서 확인한다. 로컬 접속 성공이 GitHub의 OIDC 실행 성공을 대신하지 않는다.
