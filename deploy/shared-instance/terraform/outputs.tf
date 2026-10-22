# 네트워크

output "vpc_id" {
  description = "공용 환경 VPC ID."
  value       = aws_vpc.this.id
}

output "public_subnet_id" {
  description = "EC2를 두는 공개 서브넷 ID."
  value       = aws_subnet.public.id
}

output "private_subnet_ids" {
  description = "RDS subnet group의 비공개 서브넷 ID."
  value       = aws_subnet.private[*].id
}

output "host_security_group_id" {
  description = "EC2 보안 그룹 ID(80/443 공개, 22는 ssh_allowed_cidrs만)."
  value       = aws_security_group.host.id
}

output "rds_security_group_id" {
  description = "RDS 보안 그룹 ID(5432는 EC2 보안 그룹에서만)."
  value       = aws_security_group.rds.id
}

# RDS

output "rds_instance_id" {
  description = "RDS 인스턴스 식별자. /srv/side-project/.env의 RDS_INSTANCE_ID."
  value       = aws_db_instance.this.identifier
}

output "rds_endpoint" {
  description = "RDS 엔드포인트 호스트(포트 제외). /srv/side-project/.env의 RDS_HOST이자 서비스 DB URL의 호스트."
  value       = aws_db_instance.this.address
}

output "rds_port" {
  description = "RDS 포트."
  value       = aws_db_instance.this.port
}

output "rds_engine_version_actual" {
  description = "RDS가 실제로 고른 PostgreSQL 버전."
  value       = aws_db_instance.this.engine_version_actual
}

output "rds_master_username" {
  description = "RDS 관리자 사용자 이름. rds-bootstrap.sql을 적용할 때만 쓴다."
  value       = aws_db_instance.this.username
}

output "rds_master_user_secret_arn" {
  description = "RDS 관리자 비밀번호가 든 Secrets Manager 비밀의 ARN. 비밀번호 자체는 출력하지 않는다."
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
}

# S3

output "s3_bucket_names" {
  description = "서비스별 비공개 S3 버킷 이름. /srv/side-project/.env의 GAME_FEEDBACK_S3_BUCKET·PHOTO_CONTEST_S3_BUCKET."
  value       = { for service, bucket in aws_s3_bucket.service : service => bucket.bucket }
}

output "s3_cors_origins" {
  description = "서비스별 버킷에 적용한 CORS AllowedOrigins."
  value       = { for service, config in local.services : service => config.cors.allowed_origins }
}

# IAM

output "s3_iam_user_names" {
  description = "서비스별 S3 IAM 사용자 이름. 액세스 키는 Terraform 밖에서 발급한다(README 참고)."
  value       = { for service, user in aws_iam_user.s3 : service => user.name }
}

output "host_iam_role_name" {
  description = "EC2 인스턴스 역할 이름(RDS DescribeDBInstances, 선택적으로 SSM)."
  value       = aws_iam_role.host.name
}

# EC2

output "instance_id" {
  description = "공용 EC2 인스턴스 ID."
  value       = aws_instance.host.id
}

output "public_ip" {
  description = "EC2에 연결한 탄력적 IP. 네 호스트의 DNS A 레코드와 SIDE_DEPLOY_HOST에 쓴다."
  value       = aws_eip.host.public_ip
}

output "ssh_user" {
  description = "SSH·배포 사용자(SIDE_DEPLOY_SSH_USER). /srv/side-project 소유자이며 docker 그룹에 속한다."
  value       = local.ssh_user
}

output "ssm_session_command" {
  description = "SSM Session Manager로 셸에 접속하는 명령(Session Manager plugin 필요)."
  value       = var.enable_ssm_session_manager ? "aws ssm start-session --region ${var.region} --target ${aws_instance.host.id}" : null
}

output "ssh_host_keys_command" {
  description = "cloud-init이 콘솔 출력에 남긴 SSH host key를 AWS API로 읽는 명령. 검증한 host key로 SIDE_DEPLOY_SSH_KNOWN_HOSTS를 만든다."
  value       = "aws ec2 get-console-output --region ${var.region} --instance-id ${aws_instance.host.id} --latest --output text | sed -n '/BEGIN SSH HOST KEY KEYS/,/END SSH HOST KEY KEYS/p'"
}

# DNS

output "dns_records" {
  description = "네 호스트가 가리킬 A 레코드(이름 => 탄력적 IP)."
  value       = { for key, host in local.dns_hosts : host => aws_eip.host.public_ip }
}

output "dns_managed_by_terraform" {
  description = "Terraform이 Route 53 A 레코드를 만들었는지. false면 dns_records대로 DNS 공급자에서 직접 만든다."
  value       = local.manage_dns
}

# 서버·GitHub 설정 안내(비밀 없음)

output "host_env" {
  description = "/srv/side-project/.env에 옮길 값. ACME_EMAIL은 host.env.example 값을 확인해 함께 둔다. 비밀은 없다."
  value       = <<-EOT
    GAME_FEEDBACK_DOMAIN=${var.game_feedback_domain}
    GAME_FEEDBACK_API_DOMAIN=api.${var.game_feedback_domain}
    PHOTO_CONTEST_DOMAIN=${var.photo_contest_domain}
    PHOTO_CONTEST_API_DOMAIN=api.${var.photo_contest_domain}
    RDS_REGION=${var.region}
    RDS_INSTANCE_ID=${aws_db_instance.this.identifier}
    RDS_HOST=${aws_db_instance.this.address}
    GAME_FEEDBACK_S3_BUCKET=${aws_s3_bucket.service["game-feedback"].bucket}
    PHOTO_CONTEST_S3_BUCKET=${aws_s3_bucket.service["photo-contest"].bucket}
  EOT
}

output "github_environment_variables" {
  description = "GitHub Environment production·photo-contest-production에 넣을 Variable. SIDE_DEPLOY_SSH_KNOWN_HOSTS(ssh_host_keys_command로 확인)와 Secret SIDE_DEPLOY_SSH_KEY는 따로 등록한다."
  value = {
    SIDE_DEPLOY_HOST     = aws_eip.host.public_ip
    SIDE_DEPLOY_SSH_USER = local.ssh_user
    SIDE_DEPLOY_SSH_PORT = "22"
  }
}
