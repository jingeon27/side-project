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
