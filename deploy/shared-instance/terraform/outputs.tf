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
