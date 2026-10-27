# 공통

variable "region" {
  description = "AWS 리전. 두 서비스가 운영 S3 리전을 ap-northeast-2로 검사하므로 바꾸려면 앱 설정 검사도 함께 바꾼다."
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
  description = "리소스 이름 접두사. PostgreSQL 볼륨·스냅샷 정책 태그(<prefix>-postgres), 보안 그룹·IAM 이름에 쓰인다. 만든 뒤 바꾸면 대부분의 리소스가 교체되므로 처음에 정한다."
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
  description = "새 VPC의 IPv4 CIDR(/16~/20). 공개 서브넷은 이 범위의 첫 /24를 쓴다."
  type        = string
  default     = "10.40.0.0/16"

  validation {
    condition     = can(regex("^[0-9.]+/(1[6-9]|20)$", var.vpc_cidr)) && can(cidrnetmask(var.vpc_cidr)) && try(cidrsubnet(var.vpc_cidr, 0, 0) == var.vpc_cidr, false)
    error_message = "네트워크 주소로 시작하는 /16~/20 IPv4 CIDR이어야 한다(예: 10.40.0.0/16)."
  }
}

variable "availability_zone" {
  description = "EC2와 PostgreSQL EBS 볼륨을 둘 AZ. EBS 볼륨은 같은 AZ의 인스턴스에만 붙는다. 바꾸면 서브넷·EC2·볼륨이 교체되므로 처음에 정한다(교체된 볼륨은 최종 스냅샷에서 복원한다)."
  type        = string
  default     = "ap-northeast-2a"

  validation {
    condition     = can(regex("^[a-z]{2}(-[a-z]+)+-[0-9][a-z]$", var.availability_zone)) && startswith(var.availability_zone, var.region)
    error_message = "region에 속한 AZ 이름이어야 한다(예: ap-northeast-2a)."
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

# PostgreSQL(EC2 컨테이너)

variable "postgres_volume_size_gib" {
  description = "PostgreSQL 데이터와 배포 전 덤프(최근 7일)를 담는 암호화 gp3 EBS 볼륨 크기(GiB). EC2를 교체해도 남는다. 늘릴 수는 있어도 줄일 수 없고, 늘린 뒤에는 서버에서 resize2fs로 파일 시스템을 넓힌다."
  type        = number
  default     = 20

  validation {
    condition     = var.postgres_volume_size_gib >= 8 && var.postgres_volume_size_gib <= 16384 && floor(var.postgres_volume_size_gib) == var.postgres_volume_size_gib
    error_message = "8~16384 사이의 정수여야 한다."
  }
}

variable "postgres_snapshot_time" {
  description = "DLM 일일 스냅샷 시작 시각(UTC, hh:mm). 기본값은 한국 시간 02:00이다. 스냅샷은 시작 후 한 시간 안에 만들어진다."
  type        = string
  default     = "17:00"

  validation {
    condition     = can(regex("^([01][0-9]|2[0-3]):[0-5][0-9]$", var.postgres_snapshot_time))
    error_message = "hh:mm 형식(UTC)이어야 한다."
  }
}

variable "postgres_snapshot_retention_count" {
  description = "보존할 일일 스냅샷 수. 최소 일주일(7개)을 남긴다. 스냅샷은 증분이라 바뀐 블록만큼 요금이 붙는다."
  type        = number
  default     = 7

  validation {
    condition     = var.postgres_snapshot_retention_count >= 7 && var.postgres_snapshot_retention_count <= 35 && floor(var.postgres_snapshot_retention_count) == var.postgres_snapshot_retention_count
    error_message = "7~35 사이의 정수여야 한다."
  }
}

variable "postgres_dump_retention_days" {
  description = "backup 버킷의 배포 전 덤프(postgres/)를 보존할 기간(일). 지나면 수명 주기 규칙이 삭제한다."
  type        = number
  default     = 30

  validation {
    condition     = var.postgres_dump_retention_days >= 7 && floor(var.postgres_dump_retention_days) == var.postgres_dump_retention_days
    error_message = "7 이상의 정수여야 한다."
  }
}

# 서비스 도메인과 S3

variable "game_feedback_domain" {
  description = "Game Feedback(Game Mate) 웹 도메인. API는 api.<이 도메인>이다(proxy.sh 규칙). DNS 레코드와 host_env 출력에 쓴다."
  type        = string
  default     = "game.bambyul.com"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]+\\.[a-z]{2,}$", var.game_feedback_domain))
    error_message = "소문자 도메인 이름이어야 한다(예: game.bambyul.com)."
  }
}

variable "photo_contest_domain" {
  description = "Photo Contest(별사대) 웹 도메인. API는 api.<이 도메인>이다(proxy.sh 규칙). DNS 레코드와 host_env 출력에 쓴다."
  type        = string
  default     = "contest.bambyul.com"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]+\\.[a-z]{2,}$", var.photo_contest_domain)) && var.photo_contest_domain != var.game_feedback_domain
    error_message = "game_feedback_domain과 다른 소문자 도메인 이름이어야 한다(예: contest.bambyul.com)."
  }
}

variable "media_bucket_name" {
  description = "두 서비스가 서비스 폴더(<서비스>/production/)로 나눠 쓰는 기존 비공개 S3 버킷 이름. Terraform은 이 버킷을 만들거나 설정하지 않고 서비스 IAM 사용자에게 자기 폴더 권한만 준다. 가상 호스트 TLS를 위해 점(.)은 쓰지 않는다."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$", var.media_bucket_name)) && !startswith(var.media_bucket_name, "xn--") && !startswith(var.media_bucket_name, "sthree-")
    error_message = "3~63자의 소문자·숫자·하이픈이어야 하고 xn--, sthree-로 시작할 수 없다."
  }
}

variable "backup_bucket_name" {
  description = "PostgreSQL 배포 전 덤프를 받는 비공개 S3 버킷 이름(전역 고유). 공용 미디어 버킷과 달라야 한다. EC2 역할은 이 버킷의 postgres/ 아래에 쓰기만 할 수 있다."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$", var.backup_bucket_name)) && !startswith(var.backup_bucket_name, "xn--") && !startswith(var.backup_bucket_name, "sthree-") && var.backup_bucket_name != var.media_bucket_name
    error_message = "공용 미디어 버킷과 다른 3~63자의 소문자·숫자·하이픈이어야 하고 xn--, sthree-로 시작할 수 없다."
  }
}

variable "s3_noncurrent_version_retention_days" {
  description = "backup 버킷이 덮어쓴 이전 객체 버전을 보존할 기간(일). s3-lifecycle.json과 같은 30일이 기본이다. 복구 가능 기간과 스토리지 요금이 함께 늘어난다."
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
    EC2 인스턴스 타입(x86_64). 상시 컨테이너 메모리 한도 합계는 약 3.1GiB(Caddy 128M, PostgreSQL 512M, GF API 512M·Web 640M, PC API 768M·Web 640M)다.
    한도는 상한일 뿐 예약이 아니므로, 사용자가 적은 동안은 기본 t3.small(2 vCPU, 2GiB)에 swap(swap_size_gib)을 더해 시작한다.
    swap 사용이 계속 늘거나 컨테이너가 OOMKilled로 끝나면 t3.medium(4GiB)으로 올린다. t3.small과 t3.medium의 CPU 기준 성능은 같고 메모리만 다르다.
    타입만 바꾸면 인스턴스를 멈췄다 켜며 바뀌고 PostgreSQL 볼륨은 그대로 남는다.
  EOT
  type        = string
  default     = "t3.small"

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
  description = "암호화된 gp3 루트 볼륨 크기(GiB). 네 서비스 이미지의 current/previous와 최근 7일 이미지, 컨테이너 로그, swap을 담는다. PostgreSQL 데이터는 별도 볼륨(postgres_volume_size_gib)에 둔다. 늘릴 수는 있어도 줄일 수 없다."
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
    pg-backup.sh는 aws-cli 컨테이너를 host 네트워크(--network host)로 실행하므로 기본 1에서 덤프 업로드가 동작한다.
    2로 올리면 같은 호스트의 모든 bridge 컨테이너가 인스턴스 역할(backup 버킷 쓰기·SSM)을 쓸 수 있다는 점을 감안한다.
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

# 모니터링(CloudWatch)

variable "alarm_email" {
  description = "CloudWatch 알람(상태 검사 재부팅·CPU 크레딧 부족)을 받을 메일 주소. 비워 두면 SNS를 만들지 않고 상태 검사 실패 시 재부팅만 한다. 적용 후 받은 확인 메일의 링크를 눌러야 구독이 시작된다."
  type        = string
  default     = ""

  validation {
    condition     = var.alarm_email == "" || can(regex("^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$", var.alarm_email))
    error_message = "비워 두거나 메일 주소여야 한다."
  }
}

variable "cpu_credit_alarm_threshold" {
  description = "CPU 크레딧 잔액이 15분 동안 이 값보다 낮으면 알린다. t3.small·t3.medium은 시간당 24크레딧을 쌓으므로 기본 30은 한두 시간치 여유다. 버스터블(T) 타입이 아니면 알람을 만들지 않는다."
  type        = number
  default     = 30

  validation {
    condition     = var.cpu_credit_alarm_threshold >= 1 && floor(var.cpu_credit_alarm_threshold) == var.cpu_credit_alarm_threshold
    error_message = "1 이상의 정수여야 한다."
  }
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
