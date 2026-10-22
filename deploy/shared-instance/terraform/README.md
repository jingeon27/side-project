# 공용 배포 환경 Terraform

[공통 EC2 배포](../README.md)가 요구하는 AWS 리소스(서울 리전의 EC2 한 대 + 비공개 RDS PostgreSQL + 서비스별 비공개 S3 버킷)를 **새로** 만든다. 기존 리소스를 import하지 않는다. 서비스별 DB·role, 서버 환경 파일, 프록시, GitHub 설정은 Terraform 밖의 기존 절차를 그대로 따른다.

## 만드는 리소스

| 영역     | 리소스                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 네트워크 | VPC, 인터넷 게이트웨이, 공개 서브넷 1개(EC2), 서로 다른 AZ의 비공개 서브넷 2개(RDS), 라우팅 테이블. NAT 게이트웨이는 없다                         |
| 보안     | EC2 보안 그룹(80/443 전체, 22는 `ssh_allowed_cidrs`만), RDS 보안 그룹(5432는 EC2 보안 그룹만), 규칙을 비운 기본 보안 그룹                         |
| EC2      | Ubuntu 24.04 LTS x86_64, 암호화 gp3 루트 볼륨, IMDSv2 필수, 네트워크 인터페이스 + 탄력적 IP, cloud-init(Docker·Compose·도구, `/srv/side-project`) |
| RDS      | PostgreSQL 18, `rds.force_ssl = 1` 파라미터 그룹, subnet group, 비공개·암호화·삭제 방지·최종 스냅샷·7일 백업, Secrets Manager 관리 비밀번호       |
| S3       | 서비스별 버킷 2개: 퍼블릭 접근 차단, BucketOwnerEnforced, SSE-S3, Versioning, 수명 주기, CORS, TLS 아닌 요청 거부 정책                            |
| IAM      | EC2 역할·인스턴스 프로파일(이 RDS의 `DescribeDBInstances`, 선택적으로 SSM), 서비스별 S3 사용자 2개(자기 버킷만). **액세스 키는 만들지 않는다**    |
| DNS      | `route53_zone_id`가 있을 때만 네 호스트의 A 레코드                                                                                                |

설정은 [`s3-public-access.json`](../s3-public-access.json), [`s3-lifecycle.json`](../s3-lifecycle.json), [`s3-app-policy.json`](../s3-app-policy.json), [`rds-read-policy.json`](../rds-read-policy.json)과 두 프로젝트의 `s3-cors.json`을 HCL로 옮긴 것이다. JSON을 바꾸면 같은 커밋에서 여기도 맞춘다. RDS 조회 권한은 원본(`Resource: *`)과 달리 이 RDS 인스턴스로 좁혔다.

## 비용에 영향을 주는 기본값

아래 금액은 서울 리전 온디맨드 기준 **대략치**이며 트래픽·S3 저장량·스냅샷은 빠져 있다. 적용 전에 [AWS Pricing Calculator](https://calculator.aws/)로 확인한다.

| 변수·설정                                                     | 기본값                                   | 영향                                                                                       |
| ------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| `instance_type`                                               | `t3.medium`(2 vCPU, 4GiB)                | 약 월 $38. 컨테이너 한도 합계 약 2.7GiB + 일회성 작업·OS. `t3.large`(8GiB)는 약 두 배      |
| `instance_cpu_credits`                                        | `standard`                               | 크레딧 소진 시 기준 성능으로 제한, 추가 요금 없음. `unlimited`는 초과 사용 과금            |
| `root_volume_size_gib`                                        | 30(gp3)                                  | 약 월 $3                                                                                   |
| 탄력적 IP                                                     | 1개                                      | 공인 IPv4 요금 약 월 $3.6                                                                  |
| `rds_instance_class`                                          | `db.t4g.micro`(1GiB)                     | 약 월 $18. RDS T 클래스는 항상 Unlimited라 기준 성능 초과분이 과금된다                     |
| `rds_multi_az`                                                | `false`                                  | `true`면 RDS 인스턴스·스토리지 요금 약 두 배                                               |
| `rds_allocated_storage_gib` / `rds_max_allocated_storage_gib` | 20 / 100(gp3)                            | 약 월 $3부터. 자동 확장된 용량은 줄지 않는다                                               |
| `rds_backup_retention_days`                                   | 7                                        | DB 크기를 넘는 백업 저장량만 과금. 7 미만은 배포 스크립트가 거부한다                       |
| `rds_engine_lifecycle_support`                                | Extended Support 자동 가입 안 함         | 표준 지원 종료(PostgreSQL 18은 2031-02-28) 후 유료 Extended Support 대신 메이저 업그레이드 |
| Performance Insights·Enhanced Monitoring                      | 끔                                       | 추가 요금 없음                                                                             |
| RDS 관리 비밀번호                                             | Secrets Manager 비밀 1개                 | 약 월 $0.4                                                                                 |
| `s3_noncurrent_version_retention_days`                        | 30                                       | 삭제·덮어쓴 객체를 30일 보존한 만큼 저장 요금                                              |
| NAT 게이트웨이·VPC 엔드포인트                                 | 만들지 않음                              | 시간당·처리량 요금 없음                                                                    |
| RDS 삭제 시 자동 백업                                         | 보존(`delete_automated_backups = false`) | 파기 후에도 보존 기간 동안 백업 저장 요금                                                  |

합계는 대략 월 $65 안팎이다.

## 준비물과 권한

- Terraform 1.16 이상(CI는 1.16.6), AWS CLI v2, [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html), `gh`(GitHub 설정용).
- 운영 계정에서 VPC·EC2·RDS·S3·IAM·Route 53(선택)을 만들 수 있는 **단기 자격 증명**(IAM Identity Center 등)을 쓴다. 장기 액세스 키를 저장소나 셸 기록에 남기지 않는다. `plan`도 SSM 파라미터·AMI·인스턴스 타입·호스팅 영역을 조회하므로 자격 증명이 필요하다.
- `terraform.tfvars`, `backend.hcl`, state, plan 파일은 커밋하지 않는다([`.gitignore`](.gitignore)). `.terraform.lock.hcl`은 커밋한다. provider를 올릴 때는 `terraform init -upgrade` 후 `terraform providers lock -platform=linux_amd64 -platform=darwin_arm64 -platform=darwin_amd64`로 세 플랫폼 해시를 갱신한다.

### state 버킷 준비(한 번, 이 구성 밖)

state에는 비밀이 없도록 구성했지만(액세스 키·DB 비밀번호를 만들지 않는다) 리소스 ID와 구성이 들어 있으므로 비공개·암호화·버전 관리 버킷에 둔다. 서비스 버킷과 다른 이름을 쓰고 저장소 루트에서 실행한다.

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
cp terraform.tfvars.example terraform.tfvars  # 버킷 이름 두 개와 필요한 값을 넣는다
```

결정할 것:

- **버킷 이름**: 전역 고유, 점(.) 없이. 만든 뒤 바꾸면 버킷이 교체된다.
- **`metadata_hop_limit`**: 배포할 `scripts/rds-receipt.py`가 aws-cli를 `--network bridge`로 실행하면 `2`, host 네트워크로 실행하면 `1`(기본). 첫 배포 시점의 스크립트를 확인한다.
- **SSH와 배포 runner**: Actions CD(`ci-upload.sh`)는 SSH로 접속한다. 기본값(`ssh_allowed_cidrs = []`)은 22번을 열지 않으므로 GitHub-hosted runner로 배포하려면 runner가 닿는 범위를 연다. runner IP는 넓고 바뀌므로 `["0.0.0.0/0"]`과 키 전용 인증(Ubuntu 클라우드 이미지 기본값)을 쓰거나 self-hosted·고정 IP runner를 둔다. 운영자 셸은 SSM으로도 충분하다.
- **DNS**: Route 53 호스팅 영역이 있으면 `route53_zone_id`를 넣는다. 같은 이름의 레코드가 이미 있으면 덮어쓰지 않고 실패한다.
- **계정 고정**: `allowed_account_ids`에 운영 계정 ID를 넣어 다른 계정에 만드는 사고를 막는다.

### 2. init → plan → apply

```sh
terraform init -backend-config=backend.hcl
terraform plan -out=tfplan
terraform apply tfplan
terraform output
```

기본값의 plan은 48개 리소스를 만든다(SSH 규칙·키 페어·DNS 레코드 제외). `aws_db_instance`·`aws_s3_bucket`·`aws_instance` 속성을 검토한다. RDS 생성에 10분 안팎이 걸린다.

### 3. 호스트 확인

```sh
$(terraform output -raw ssm_session_command)
# 세션 안에서
cloud-init status --wait
cat /var/lib/side-project/host-bootstrap.done     # docker=…, compose=…
sudo -iu ubuntu                                    # 이후 작업은 배포 사용자로
```

cloud-init 실패 시 `/var/log/cloud-init-output.log`를 본다. SSM 세션은 `ssm-user`로 시작하므로 `/srv/side-project` 작업은 `ubuntu`로 전환해서 한다. user_data는 첫 부팅에만 실행되며 비밀을 담지 않는다.

### 4. DNS

`dns_managed_by_terraform`이 `false`면 `terraform output dns_records`의 네 A 레코드를 DNS 공급자에 만든다. AAAA는 만들지 않는다(이 VPC는 IPv4만 쓴다). 프록시를 시작하기 전에 네 이름이 탄력적 IP를 가리켜야 Caddy가 인증서를 받는다.

### 5. 비밀 발급(Terraform 밖)

| 비밀                           | 발급                                                                                   | 넣는 곳                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| GF S3 액세스 키                | `aws iam create-access-key --user-name side-shared-game-feedback-s3`                   | `/srv/side-project/services/game-feedback/.env`의 `GF_S3_ACCESS_KEY_ID`·`GF_S3_SECRET_ACCESS_KEY` |
| PC S3 액세스 키                | `aws iam create-access-key --user-name side-shared-photo-contest-s3`                   | `/srv/side-project/services/photo-contest/.env`의 `AWS_ACCESS_KEY_ID`·`AWS_SECRET_ACCESS_KEY`     |
| RDS 관리자 비밀번호            | 이미 Secrets Manager에 있다(`rds_master_user_secret_arn`). RDS가 기본 7일마다 회전한다 | 서버에 저장하지 않는다. 6단계 `psql -W` 프롬프트에만 입력                                         |
| 서비스 DB 비밀번호 4개         | `openssl rand -base64 36` 등으로 서로 다른 32자 이상                                   | 6단계 `\password` 프롬프트, 7단계 `DATABASE_URL`·`DATABASE_MIGRATION_URL`(URL 인코딩)             |
| `GF_CACHE_REVALIDATION_SECRET` | `openssl rand -hex 32`                                                                 | GF 서비스 `.env`                                                                                  |
| 배포용 SSH 키                  | `ssh-keygen -t ed25519 -N '' -C github-actions-deploy -f side-deploy`                  | 공개 키는 호스트 `/home/ubuntu/.ssh/authorized_keys`, 개인 키는 9단계 GitHub Secret               |
| OAuth·Supercell·Sentry         | 각 공급자 콘솔                                                                         | 서비스별 `.env`                                                                                   |

액세스 키는 출력이 로그·공유 화면에 남지 않는 단말에서 발급해 서버 파일에 바로 옮긴다. 키를 Terraform으로 만들지 않는 이유는 비밀 키가 state에 평문으로 남기 때문이다. 배포 시 `verify-services.mjs`는 자기 버킷 접근(HeadBucket)과 두 버킷 이름이 다른지만 확인하므로, 한쪽 키로 다른 버킷이 거부되는지는 직접 확인한다.

```sh
# 예: GF 키로 PC 버킷 접근이 거부되는지(403 기대). 키는 셸 기록에 남기지 않도록 프롬프트로 읽는다.
read -rs AWS_ACCESS_KEY_ID; read -rs AWS_SECRET_ACCESS_KEY; export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
aws s3api head-bucket --bucket "$(terraform output -json s3_bucket_names | python3 -c 'import json,sys; print(json.load(sys.stdin)["photo-contest"])')"
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
```

### 6. 호스트 파일과 DB 초기화

`ubuntu` 사용자로 저장소를 체크아웃하고 `prepare.sh`를 실행한다. `/srv/side-project`는 cloud-init이 이미 만들었다(`ubuntu` 소유, 700). `prepare.sh`가 내려받는 RDS CA(`/srv/side-project/certs/rds-ca.pem`)를 아래 `psql`이 쓰므로 DB 초기화보다 먼저 실행한다.

```sh
git clone https://github.com/jingeon27/side-project.git ~/side-project && cd ~/side-project
bash deploy/shared-instance/scripts/prepare.sh
```

관리자 비밀번호를 운영자 단말에서 조회한 뒤(`aws secretsmanager get-secret-value --secret-id "$(terraform output -raw rds_master_user_secret_arn)" --query SecretString --output text`) 호스트에서 [`rds-bootstrap.sql`](../rds-bootstrap.sql)을 **한 번** 적용한다. `psql`은 cloud-init이 설치한 Ubuntu 기본 클라이언트(16)이며 서버 18에 버전 경고만 내고 동작한다.

```sh
PGSSLMODE=verify-full PGSSLROOTCERT=/srv/side-project/certs/rds-ca.pem \
  psql -h RDS_ENDPOINT -U side_admin -d postgres -W \
  -v ON_ERROR_STOP=1 -f deploy/shared-instance/rds-bootstrap.sql
```

`RDS_ENDPOINT`는 `terraform output -raw rds_endpoint`, 사용자 이름은 `rds_master_username`이다. 각 `\password`에 5단계의 서비스 DB 비밀번호를 입력한다.

### 7. 서버 환경 파일

- `/srv/side-project/.env`: `terraform output -raw host_env`의 값으로 바꾸고 `ACME_EMAIL`은 확인해 둔다.
- 서비스별 `.env`: `DATABASE_URL`·`DATABASE_MIGRATION_URL`의 `RDS_ENDPOINT`와 `REPLACE`(URL 인코딩한 비밀번호), S3 키, 나머지 비밀을 채운다. 모두 `chmod 600`이며 Git·Actions 로그에 올리지 않는다.

이어서 [공통 EC2 배포](../README.md#프록시와-github-actions)대로 `proxy.sh validate` → `proxy.sh start`를 실행한다.

### 8. 배포 runner 접속 경로

배포용 공개 키를 `/home/ubuntu/.ssh/authorized_keys`에 추가하고, GitHub-hosted runner를 쓰면 `ssh_allowed_cidrs`로 22번을 연 상태인지 확인한다(1단계).

### 9. GitHub Environment 변수·비밀

`production`(Game Feedback)과 `photo-contest-production`(Photo Contest) Environment는 이미 있고 배포 브랜치는 `main`이다. 두 Environment에 같은 값을 넣는다. 기준은 [`.github/workflows/game-feedback.yml`](../../../.github/workflows/game-feedback.yml)·[`photo-contest.yml`](../../../.github/workflows/photo-contest.yml)의 `vars.*`·`secrets.*`다.

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
for env in production photo-contest-production; do
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
| `GF_SITE_URL`                                                    | `https://game.bambyul.com`                    |
| `GF_CONTACT_EMAIL`                                               | `contact@bambyul.com`                         |
| `PHOTO_CONTEST_SITE_URL`                                         | `https://contest.bambyul.com`                 |
| `PHOTO_CONTEST_DEPLOY_BRANCH`                                    | `main`(Environment 배포 브랜치와 같아야 한다) |
| `GF_WEB_SENTRY_DSN`·`GF_AMPLITUDE_API_KEY`                       | 선택                                          |
| `PHOTO_CONTEST_WEB_SENTRY_DSN`·`PHOTO_CONTEST_AMPLITUDE_API_KEY` | 선택                                          |
| `GF_DEPLOY_ENABLED`·`PHOTO_CONTEST_DEPLOY_ENABLED`               | 마지막에 `true`                               |

`*_DEPLOY_ENABLED`는 프록시·환경 파일·복구 연습을 마친 뒤에 켠다. DB·S3·OAuth 비밀은 GitHub에 넣지 않고 서버의 서비스별 환경 파일에만 둔다.

## 기존 수동 절차와의 관계

[공통 EC2 배포](../README.md)의 "AWS에서 먼저 준비할 것" 1~5를 이 구성이 대신한다.

| 수동 절차                                         | Terraform                                               | 남는 수동 작업                                    |
| ------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------- |
| 1. EC2·고정 IP·DNS·Docker 등 도구·SSH             | `compute.tf`, `security.tf`, `dns.tf`(선택), cloud-init | Route 53 밖 DNS, SSH 공개 범위 결정, 배포 키 등록 |
| 2. 비공개 RDS·암호화·삭제 방지·백업·force_ssl     | `database.tf`                                           | `rds-bootstrap.sql`, 마이그레이션 호환성 확인     |
| 3. EC2 역할의 RDS 조회 정책, hop limit            | `iam.tf`, `metadata_hop_limit`                          | 배포할 스크립트에 맞는 hop limit 선택             |
| 4. 버킷 2개·차단·암호화·Versioning·수명 주기·CORS | `storage.tf`                                            | 없음(origin은 변수)                               |
| 5. 서비스별 IAM 자격 증명                         | `iam.tf`의 사용자·정책                                  | 액세스 키 발급과 교차 접근 거부 확인              |

`projects/game-feedback/deploy/lightsail`의 이전 단독 구성과는 무관하며 그 리소스를 가져오거나 바꾸지 않는다.

## 운영 중 변경

- 새 AMI가 게시되거나 `user_data`·`ssh_public_key`가 바뀌어도 EC2를 교체하지 않는다(`ignore_changes`). 호스트를 새로 만들려면 `terraform apply -replace=aws_instance.host`로 명시한다. 탄력적 IP는 네트워크 인터페이스에 붙어 있어 교체 후에도 유지되지만 루트 볼륨(이미지·Caddy 인증서·`/srv/side-project`)과 SSH host key는 새로 만들어지므로 3·6·7·9단계를 다시 한다.
- RDS의 클래스·스토리지 변경은 `rds_apply_immediately = false`면 다음 유지 관리 시간대(한국 시간 월요일 03:00)에 적용된다.
- `name_prefix`·버킷 이름·`vpc_cidr`·`availability_zones`를 바꾸면 해당 리소스가 교체된다. plan의 `must be replaced`를 반드시 확인한다.
- 오프라인 검사: `terraform fmt -check -recursive`, `terraform init -backend=false`, `terraform validate`, `terraform test`(mock provider, AWS 호출 없음). CI는 [`.github/workflows/terraform.yml`](../../../.github/workflows/terraform.yml)에서 같은 검사를 한다.

## 파기 시 주의

`terraform destroy`는 운영 DB와 미디어를 지운다. 백업과 복구 지점을 확인한 뒤에만 한다.

1. `rds_deletion_protection = false`, `instance_termination_protection = false`로 apply한다. 삭제 방지가 켜져 있으면 destroy가 실패한다.
2. RDS는 `final_snapshot_identifier`(기본 `side-shared-postgres-final`)로 최종 스냅샷을 남기고 자동 백업도 보존 기간 동안 남는다. 둘 다 요금이 붙으므로 필요 없어지면 직접 지운다. 같은 이름의 스냅샷이 있으면 삭제가 실패하므로 두 번째 파기부터는 `rds_final_snapshot_identifier`를 바꾼다. RDS가 관리하던 관리자 비밀은 인스턴스와 함께 삭제된다.
3. S3 버킷은 `force_destroy = false`라 객체가 남아 있으면 지우지 않는다. Versioning 버킷은 모든 이전 버전과 삭제 마커까지 비워야 삭제된다(복구 불가). 버킷을 남기려면 `terraform state rm 'aws_s3_bucket.service["…"]'` 등으로 관리 대상에서 먼저 뺀다.
4. 서비스 IAM 사용자에 콘솔·CLI로 발급한 액세스 키가 있으면 삭제가 실패한다. 키를 먼저 비활성화·삭제한다.
5. 탄력적 IP가 해제되면 같은 주소를 다시 받을 수 없다. DNS와 `SIDE_DEPLOY_HOST`·known_hosts를 갱신한다.
6. state 버킷은 이 구성 밖이므로 남는다.
