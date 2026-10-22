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
