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
