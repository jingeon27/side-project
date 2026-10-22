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
