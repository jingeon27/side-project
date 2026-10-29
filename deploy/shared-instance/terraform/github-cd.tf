# GitHub Environment의 main 브랜치 제한과 함께 사용한다. AWS 장기 키와 외부 SSH 인바운드는 필요 없다.
variable "github_oidc_subjects" {
  description = "CD를 허용할 정확한 GitHub OIDC sub 목록. repo:<소유자>/<저장소>:environment:<환경> 형식이며 immutable ID 형식도 지원한다. 비우면 CD 역할을 만들지 않는다."
  type        = set(string)
  default     = []

  validation {
    condition     = alltrue([for subject in var.github_oidc_subjects : can(regex("^repo:[A-Za-z0-9_.@-]+/[A-Za-z0-9_.@-]+:environment:(game-feedback-production|photo-contest-production)$", subject))])
    error_message = "와일드카드 없이 정확한 저장소와 두 운영 Environment의 sub만 지정한다."
  }
  validation {
    condition     = length(var.github_oidc_subjects) == 0 || var.enable_ssm_session_manager
    error_message = "GitHub SSM CD에는 enable_ssm_session_manager=true가 필요하다."
  }
}

locals {
  github_cd_enabled = length(var.github_oidc_subjects) > 0
}

data "aws_caller_identity" "github_cd" {
  count = local.github_cd_enabled ? 1 : 0
}

resource "aws_iam_openid_connect_provider" "github" {
  count = local.github_cd_enabled ? 1 : 0

  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

resource "aws_iam_role" "github_cd" {
  count = local.github_cd_enabled ? 1 : 0

  name                 = "${local.name}-github-cd"
  max_session_duration = 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRoleWithWebIdentity"
      Principal = { Federated = aws_iam_openid_connect_provider.github[0].arn }
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = var.github_oidc_subjects
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "github_cd" {
  count = local.github_cd_enabled ? 1 : 0

  name = "shared-host-ssh-session"
  role = aws_iam_role.github_cd[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "ssm:StartSession"
        Resource = [
          aws_instance.host.arn,
          "arn:${data.aws_partition.current.partition}:ssm:${var.region}::document/AWS-StartSSHSession",
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["ssmmessages:OpenDataChannel", "ssm:TerminateSession", "ssm:ResumeSession"]
        Resource = "arn:${data.aws_partition.current.partition}:ssm:${var.region}:${data.aws_caller_identity.github_cd[0].account_id}:session/side-cd-*"
      },
    ]
  })
}

output "github_cd_role_arn" {
  description = "두 GitHub 운영 Environment의 SIDE_DEPLOY_AWS_ROLE_ARN."
  value       = one(aws_iam_role.github_cd[*].arn)
}

output "github_cd_instance_id" {
  description = "두 GitHub 운영 Environment의 SIDE_DEPLOY_SSM_INSTANCE_ID."
  value       = local.github_cd_enabled ? aws_instance.host.id : null
}
