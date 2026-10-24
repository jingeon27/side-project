# 공통

variable "region" {
  description = "AWS 리전. 공용 배포 스크립트(rds-receipt.py)가 서울 리전(ap-northeast-2)을 전제로 하므로 바꾸려면 스크립트도 함께 바꾼다."
  type        = string
  default     = "ap-northeast-2"

  validation {
    condition     = can(regex("^[a-z]{2}(-[a-z]+)+-[0-9]$", var.region))
    error_message = "AWS 리전 이름 형식이어야 한다(예: ap-northeast-2)."
  }
}

variable "allowed_account_ids" {
  description = "적용을 허용할 AWS 계정 ID 목록. 비워 두면 검사하지 않는다. 다른 계정에 만드는 사고를 막으려면 운영 계정 ID를 넣는다."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for id in var.allowed_account_ids : can(regex("^[0-9]{12}$", id))])
    error_message = "계정 ID는 12자리 숫자여야 한다."
  }
}

variable "name_prefix" {
  description = "리소스 이름 접두사. RDS 식별자(<prefix>-postgres), 보안 그룹·IAM 이름에 쓰인다. 만든 뒤 바꾸면 대부분의 리소스가 교체되므로 처음에 정한다."
  type        = string
  default     = "side-shared"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,22}[a-z0-9]$", var.name_prefix)) && !strcontains(var.name_prefix, "--")
    error_message = "소문자로 시작하는 4~24자의 소문자·숫자·하이픈이어야 하고, 하이픈으로 끝나거나 하이픈을 연속으로 쓸 수 없다."
  }
}

variable "tags" {
  description = "모든 리소스에 더할 태그. Project·Stack·ManagedBy·Repository 기본 태그는 덮어쓰지 않는다."
  type        = map(string)
  default     = {}
}

# 네트워크

variable "vpc_cidr" {
  description = "새 VPC의 IPv4 CIDR(/16~/20). 서브넷은 이 범위를 /24로 나눠 공개 0번, 비공개 10·11번을 쓴다."
  type        = string
  default     = "10.40.0.0/16"

  validation {
    condition     = can(regex("^[0-9.]+/(1[6-9]|20)$", var.vpc_cidr)) && can(cidrnetmask(var.vpc_cidr)) && try(cidrsubnet(var.vpc_cidr, 0, 0) == var.vpc_cidr, false)
    error_message = "네트워크 주소로 시작하는 /16~/20 IPv4 CIDR이어야 한다(예: 10.40.0.0/16)."
  }
}

variable "availability_zones" {
  description = "서로 다른 AZ 두 개. 비공개 서브넷(RDS subnet group)을 하나씩 두고, 첫 번째 AZ에 공개 서브넷(EC2)과 Single-AZ RDS를 둔다. EC2와 RDS를 같은 AZ에 두면 AZ 간 전송 요금이 생기지 않는다. 바꾸면 서브넷과 그 안의 리소스가 교체된다."
  type        = list(string)
  default     = ["ap-northeast-2a", "ap-northeast-2c"]

  validation {
    condition     = length(var.availability_zones) == 2 && length(distinct(var.availability_zones)) == 2 && alltrue([for az in var.availability_zones : startswith(az, var.region)])
    error_message = "region에 속한 서로 다른 AZ 두 개를 지정한다."
  }
}

variable "ssh_allowed_cidrs" {
  description = <<-EOT
    SSH(22)를 허용할 IPv4 CIDR 목록. 기본 빈 목록이면 22번 규칙을 만들지 않고 SSM Session Manager(enable_ssm_session_manager)로 접속한다.
    GitHub-hosted runner의 SSH 배포(ci-upload.sh)는 22번이 runner에 열려 있어야 한다. runner IP는 범위가 넓고 바뀌므로 키 전용 인증과 함께 0.0.0.0/0을 열지, self-hosted·고정 IP runner를 쓸지 정한다.
  EOT
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for cidr in var.ssh_allowed_cidrs : can(cidrnetmask(cidr))])
    error_message = "IPv4 CIDR이어야 한다(예: 203.0.113.10/32)."
  }
}

# RDS PostgreSQL

variable "rds_engine_version" {
  description = <<-EOT
    RDS PostgreSQL 엔진 버전. 메이저만 쓰면(예: 18) RDS가 그 메이저의 기본 마이너를 고르고 auto minor upgrade로 올린다.
    기본값 18은 로컬 개발·CI가 쓰는 메이저(embedded-postgres 18.4, postgres:18 이미지)와 같다. RDS는 2025-11-14부터 18을 지원하며 표준 지원은 2031-02-28까지다.
    파라미터 그룹 family(postgres<메이저>)도 이 값에서 정한다. 메이저 업그레이드는 rds_allow_major_version_upgrade를 함께 켠다.
  EOT
  type        = string
  default     = "18"

  validation {
    condition     = can(regex("^(1[6-9]|[2-9][0-9])(\\.[0-9]+)?$", var.rds_engine_version))
    error_message = "16 이상의 메이저(예: 18) 또는 메이저.마이너(예: 18.6)여야 한다."
  }
}

variable "rds_allow_major_version_upgrade" {
  description = "rds_engine_version의 메이저를 올릴 때만 true로 둔다. 복구 지점 확인과 migration 호환성 검토를 먼저 한다."
  type        = bool
  default     = false
}

variable "rds_engine_lifecycle_support" {
  description = "메이저 버전 표준 지원이 끝난 뒤의 처리. 기본값은 유료 Extended Support에 자동 가입하지 않는다(그 시점에 RDS가 메이저 업그레이드를 진행한다). 가입하려면 open-source-rds-extended-support로 바꾼다."
  type        = string
  default     = "open-source-rds-extended-support-disabled"

  validation {
    condition     = contains(["open-source-rds-extended-support", "open-source-rds-extended-support-disabled"], var.rds_engine_lifecycle_support)
    error_message = "open-source-rds-extended-support 또는 open-source-rds-extended-support-disabled여야 한다."
  }
}

variable "rds_instance_class" {
  description = "RDS 인스턴스 클래스. 두 API 풀(각 5) + migrator(각 2) + 관리자 연결은 db.t4g.micro(1GiB)의 기본 max_connections 안에 들어가지만 메모리가 작다. 부하를 측정해 db.t4g.small 이상으로 올린다. RDS의 T 클래스는 항상 Unlimited 크레딧 모드라 기준 성능을 넘겨 오래 쓰면 추가 요금이 붙는다."
  type        = string
  default     = "db.t4g.micro"

  validation {
    condition     = can(regex("^db\\.[a-z0-9]+\\.[a-z0-9]+$", var.rds_instance_class))
    error_message = "db.<family>.<size> 형식이어야 한다(예: db.t4g.micro)."
  }
}

variable "rds_multi_az" {
  description = "Multi-AZ 대기 인스턴스. 켜면 인스턴스·스토리지 요금이 약 두 배가 된다. 기본은 Single-AZ이며 첫 번째 AZ(EC2와 같은 AZ)에 둔다."
  type        = bool
  default     = false
}

variable "rds_allocated_storage_gib" {
  description = "gp3 스토리지 초기 크기(GiB). RDS gp3 최소값은 20이다. 늘릴 수는 있어도 줄일 수 없다."
  type        = number
  default     = 20

  validation {
    condition     = var.rds_allocated_storage_gib >= 20 && var.rds_allocated_storage_gib <= 65536 && floor(var.rds_allocated_storage_gib) == var.rds_allocated_storage_gib
    error_message = "20~65536 사이의 정수여야 한다."
  }
}

variable "rds_max_allocated_storage_gib" {
  description = "스토리지 자동 확장 상한(GiB). 0이면 자동 확장을 끈다. 자동 확장된 용량은 줄어들지 않으며 그만큼 요금이 붙는다."
  type        = number
  default     = 100

  validation {
    condition     = var.rds_max_allocated_storage_gib == 0 || (var.rds_max_allocated_storage_gib > var.rds_allocated_storage_gib && var.rds_max_allocated_storage_gib <= 65536)
    error_message = "0이거나 rds_allocated_storage_gib보다 크고 65536 이하여야 한다."
  }
}

variable "rds_master_username" {
  description = "RDS 관리자 사용자 이름. 비밀번호는 RDS가 Secrets Manager에 만들고 관리한다(state에 남지 않는다). 관리자 URL을 앱 runtime에 넣지 않는다."
  type        = string
  default     = "side_admin"

  validation {
    condition     = can(regex("^[a-z][a-z0-9_]{0,62}$", var.rds_master_username)) && !contains(["rdsadmin", "rdsrepladmin", "postgres", "admin"], var.rds_master_username)
    error_message = "소문자로 시작하는 63자 이하의 소문자·숫자·밑줄이어야 하며 rdsadmin·rdsrepladmin·postgres·admin은 쓰지 않는다."
  }
}

variable "rds_backup_retention_days" {
  description = "자동 백업(PITR) 보존 기간(일). 공용 배포 스크립트가 7일 미만을 거부하므로 7~35만 허용한다. DB 크기를 넘는 백업 스토리지는 요금이 붙는다."
  type        = number
  default     = 7

  validation {
    condition     = var.rds_backup_retention_days >= 7 && var.rds_backup_retention_days <= 35 && floor(var.rds_backup_retention_days) == var.rds_backup_retention_days
    error_message = "7~35 사이의 정수여야 한다."
  }
}

variable "rds_backup_window" {
  description = "자동 백업 시간대(UTC, hh24:mi-hh24:mi). 기본값은 한국 시간 02:00~02:30이다. 유지 관리 시간대와 겹치면 안 된다."
  type        = string
  default     = "17:00-17:30"

  validation {
    condition     = can(regex("^([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9]$", var.rds_backup_window))
    error_message = "hh24:mi-hh24:mi 형식(UTC)이어야 한다."
  }
}

variable "rds_maintenance_window" {
  description = "유지 관리 시간대(UTC, ddd:hh24:mi-ddd:hh24:mi). 기본값은 한국 시간 월요일 03:00~04:00이다. auto minor upgrade도 이때 적용된다."
  type        = string
  default     = "sun:18:00-sun:19:00"

  validation {
    condition     = can(regex("^(mon|tue|wed|thu|fri|sat|sun):([01][0-9]|2[0-3]):[0-5][0-9]-(mon|tue|wed|thu|fri|sat|sun):([01][0-9]|2[0-3]):[0-5][0-9]$", var.rds_maintenance_window))
    error_message = "ddd:hh24:mi-ddd:hh24:mi 형식(UTC)이어야 한다."
  }
}

variable "rds_deletion_protection" {
  description = "RDS 삭제 방지. 공용 배포 스크립트(rds-receipt.py)가 false인 인스턴스로의 배포를 거부한다. 파기할 때만 false로 apply한 뒤 destroy한다."
  type        = bool
  default     = true
}

variable "rds_apply_immediately" {
  description = "RDS 변경을 즉시 적용할지 여부. false면 클래스·스토리지 등 재시작이 필요한 변경은 다음 유지 관리 시간대에 적용된다."
  type        = bool
  default     = false
}

variable "rds_final_snapshot_identifier" {
  description = "RDS를 삭제할 때 남길 최종 스냅샷 이름. 비워 두면 <name_prefix>-postgres-final을 쓴다. 같은 이름의 스냅샷이 이미 있으면 삭제가 실패하므로 두 번째 파기부터는 새 이름을 넣는다."
  type        = string
  default     = ""

  validation {
    condition     = var.rds_final_snapshot_identifier == "" || (can(regex("^[a-z][a-z0-9-]{0,254}$", var.rds_final_snapshot_identifier)) && !strcontains(var.rds_final_snapshot_identifier, "--") && !endswith(var.rds_final_snapshot_identifier, "-"))
    error_message = "소문자로 시작하는 소문자·숫자·하이픈이어야 하고, 하이픈으로 끝나거나 하이픈을 연속으로 쓸 수 없다."
  }
}

# 서비스 도메인과 S3

variable "game_feedback_domain" {
  description = "Game Feedback(Game Mate) 웹 도메인. API는 api.<이 도메인>이다(proxy.sh 규칙). S3 CORS 기본 origin과 DNS 레코드에 쓴다."
  type        = string
  default     = "game.bambyul.com"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]+\\.[a-z]{2,}$", var.game_feedback_domain))
    error_message = "소문자 도메인 이름이어야 한다(예: game.bambyul.com)."
  }
}

variable "photo_contest_domain" {
  description = "Photo Contest(별사대) 웹 도메인. API는 api.<이 도메인>이다(proxy.sh 규칙). S3 CORS 기본 origin과 DNS 레코드에 쓴다."
  type        = string
  default     = "contest.bambyul.com"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]+\\.[a-z]{2,}$", var.photo_contest_domain)) && var.photo_contest_domain != var.game_feedback_domain
    error_message = "game_feedback_domain과 다른 소문자 도메인 이름이어야 한다(예: contest.bambyul.com)."
  }
}

variable "game_feedback_bucket_name" {
  description = "Game Feedback 비공개 S3 버킷 이름(전역 고유). 만든 뒤 바꾸면 버킷이 교체되므로 처음에 정한다. 가상 호스트 TLS를 위해 점(.)은 쓰지 않는다."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$", var.game_feedback_bucket_name)) && !startswith(var.game_feedback_bucket_name, "xn--") && !startswith(var.game_feedback_bucket_name, "sthree-")
    error_message = "3~63자의 소문자·숫자·하이픈이어야 하고 xn--, sthree-로 시작할 수 없다."
  }
}

variable "photo_contest_bucket_name" {
  description = "Photo Contest 비공개 S3 버킷 이름(전역 고유). game_feedback_bucket_name과 달라야 한다. 만든 뒤 바꾸면 버킷이 교체되므로 처음에 정한다."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$", var.photo_contest_bucket_name)) && !startswith(var.photo_contest_bucket_name, "xn--") && !startswith(var.photo_contest_bucket_name, "sthree-") && var.photo_contest_bucket_name != var.game_feedback_bucket_name
    error_message = "game_feedback_bucket_name과 다른 3~63자의 소문자·숫자·하이픈이어야 하고 xn--, sthree-로 시작할 수 없다."
  }
}

variable "game_feedback_cors_origins" {
  description = "Game Feedback 버킷 CORS의 AllowedOrigins. 비워 두면 https://<game_feedback_domain> 하나를 쓴다. 로컬 개발 origin(http://localhost:3300 등)을 운영 버킷에 넣지 않는 것을 기본으로 한다."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for origin in var.game_feedback_cors_origins : can(regex("^(https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?|http://(localhost|127\\.0\\.0\\.1))(:[0-9]{1,5})?$", origin))])
    error_message = "https://<host>[:port] 또는 http://localhost·127.0.0.1[:port] 형식이어야 하며 경로·끝 슬래시·와일드카드는 쓰지 않는다."
  }
}

variable "photo_contest_cors_origins" {
  description = "Photo Contest 버킷 CORS의 AllowedOrigins. 비워 두면 https://<photo_contest_domain> 하나를 쓴다."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for origin in var.photo_contest_cors_origins : can(regex("^(https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?|http://(localhost|127\\.0\\.0\\.1))(:[0-9]{1,5})?$", origin))])
    error_message = "https://<host>[:port] 또는 http://localhost·127.0.0.1[:port] 형식이어야 하며 경로·끝 슬래시·와일드카드는 쓰지 않는다."
  }
}

variable "s3_noncurrent_version_retention_days" {
  description = "이전 객체 버전을 보존할 기간(일). s3-lifecycle.json과 같은 30일이 기본이다. 복구 가능 기간과 스토리지 요금이 함께 늘어난다."
  type        = number
  default     = 30

  validation {
    condition     = var.s3_noncurrent_version_retention_days >= 1 && floor(var.s3_noncurrent_version_retention_days) == var.s3_noncurrent_version_retention_days
    error_message = "1 이상의 정수여야 한다."
  }
}

# IAM

variable "enable_ssm_session_manager" {
  description = "EC2 역할에 AmazonSSMManagedInstanceCore를 붙여 SSM Session Manager로 접속한다. SSH를 닫아 두는 기본 구성(ssh_allowed_cidrs = [])에서는 유일한 셸 접속 경로다."
  type        = bool
  default     = true
}

# EC2

variable "instance_type" {
  description = <<-EOT
    EC2 인스턴스 타입(x86_64). 상시 컨테이너 메모리 한도 합계는 약 2.7GiB(Caddy 128M, GF API 512M·Web 640M, PC API 768M·Web 640M)이고,
    배포 중 일회성 ops·migrate(각 256M)와 OS·Docker가 더 필요하다. 기본 t3.medium(2 vCPU, 4GiB)에 swap(swap_size_gib)을 더한다.
    업로드·SSR 부하에서 메모리가 모자라면 t3.large(8GiB)로 올린다(요금 약 두 배).
  EOT
  type        = string
  default     = "t3.medium"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]*\\.[a-z0-9]+$", var.instance_type))
    error_message = "EC2 인스턴스 타입 형식이어야 한다(예: t3.medium)."
  }
}

variable "instance_cpu_credits" {
  description = "버스터블(T) 인스턴스의 CPU 크레딧 모드. standard는 크레딧이 떨어지면 기준 성능(t3.medium은 vCPU당 20%)으로 제한해 추가 요금이 없다. unlimited는 제한 없이 초과분을 과금한다(AWS 기본값). T 계열이 아니면 무시한다."
  type        = string
  default     = "standard"

  validation {
    condition     = contains(["standard", "unlimited"], var.instance_cpu_credits)
    error_message = "standard 또는 unlimited여야 한다."
  }
}

variable "ami_ssm_parameter" {
  description = <<-EOT
    AMI ID를 담은 Canonical Ubuntu Server 공개 SSM 파라미터(amd64). 기본은 Ubuntu 24.04 LTS gp3 최신 이미지다.
    user_data가 apt·Docker 공식 Ubuntu 저장소를 쓰므로 Ubuntu LTS만 지원한다. 이미 만든 인스턴스는 새 AMI가 나와도 교체하지 않는다(ignore_changes).
  EOT
  type        = string
  default     = "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id"

  validation {
    condition     = can(regex("^/aws/service/canonical/ubuntu/server/[0-9]{2}\\.04/stable/current/amd64/hvm/ebs-gp3/ami-id$", var.ami_ssm_parameter))
    error_message = "/aws/service/canonical/ubuntu/server/<YY>.04/stable/current/amd64/hvm/ebs-gp3/ami-id 형식(Ubuntu LTS, amd64)이어야 한다."
  }
}

variable "root_volume_size_gib" {
  description = "암호화된 gp3 루트 볼륨 크기(GiB). 네 서비스 이미지의 current/previous와 최근 7일 이미지, 컨테이너 로그, swap을 담는다. 늘릴 수는 있어도 줄일 수 없다."
  type        = number
  default     = 30

  validation {
    condition     = var.root_volume_size_gib >= 20 && var.root_volume_size_gib <= 16384 && floor(var.root_volume_size_gib) == var.root_volume_size_gib
    error_message = "20~16384 사이의 정수여야 한다."
  }
}

variable "metadata_hop_limit" {
  description = <<-EOT
    IMDSv2 PUT 응답 hop limit. 기본 1이면 호스트 네트워크의 프로세스만 인스턴스 역할 자격 증명을 읽고 bridge 네트워크의 컨테이너는 읽지 못한다.
    현재 rds-receipt.py는 aws-cli 컨테이너를 host 네트워크(--network host)로 실행하므로 기본 1에서 RDS 복구 지점 조회가 동작한다.
    이전 bridge 네트워크 버전의 스크립트를 배포할 때만 2가 필요하다.
    2로 올리면 같은 호스트의 모든 bridge 컨테이너가 인스턴스 역할(RDS 조회·SSM)을 쓸 수 있다는 점을 감안한다.
  EOT
  type        = number
  default     = 1

  validation {
    condition     = contains([1, 2], var.metadata_hop_limit)
    error_message = "1 또는 2여야 한다."
  }
}

variable "ssh_public_key" {
  description = "운영자 SSH 공개 키(OpenSSH 한 줄). 비워 두면 키 페어를 만들지 않고 SSM으로 접속한다. 키는 첫 부팅에만 ubuntu 사용자에 들어가며, 이후 키 변경·배포용 키 추가는 서버의 ~/.ssh/authorized_keys에서 한다."
  type        = string
  default     = ""

  validation {
    condition     = var.ssh_public_key == "" || can(regex("^(ssh-ed25519|ecdsa-sha2-nistp(256|384|521)|ssh-rsa) [A-Za-z0-9+/=]+( .*)?$", var.ssh_public_key))
    error_message = "비워 두거나 ssh-ed25519·ecdsa·ssh-rsa 형식의 공개 키 한 줄이어야 한다."
  }
}

variable "swap_size_gib" {
  description = "첫 부팅 때 만드는 swap 파일 크기(GiB). 0이면 만들지 않는다. 일시적인 메모리 부족에 따른 OOM을 줄이지만 처리량을 보장하지 않는다."
  type        = number
  default     = 2

  validation {
    condition     = var.swap_size_gib >= 0 && var.swap_size_gib <= 16 && floor(var.swap_size_gib) == var.swap_size_gib
    error_message = "0~16 사이의 정수여야 한다."
  }
}

variable "instance_termination_protection" {
  description = "EC2 종료 방지(disable_api_termination). 파기할 때만 false로 apply한 뒤 destroy한다."
  type        = bool
  default     = true
}

# DNS(선택)

variable "route53_zone_id" {
  description = "네 호스트(game, api.game, contest, api.contest)의 A 레코드를 만들 Route 53 호스팅 영역 ID. 비워 두면 레코드를 만들지 않고 dns_records 출력으로 안내한다. 같은 이름의 레코드가 이미 있으면 덮어쓰지 않고 실패한다."
  type        = string
  default     = ""

  validation {
    condition     = var.route53_zone_id == "" || can(regex("^Z[A-Z0-9]{1,31}$", var.route53_zone_id))
    error_message = "비워 두거나 Route 53 호스팅 영역 ID(Z로 시작)여야 한다."
  }
}

variable "dns_ttl" {
  description = "Route 53 A 레코드 TTL(초)."
  type        = number
  default     = 300

  validation {
    condition     = var.dns_ttl >= 60 && var.dns_ttl <= 86400 && floor(var.dns_ttl) == var.dns_ttl
    error_message = "60~86400 사이의 정수여야 한다."
  }
}
