# 두 서비스가 함께 쓰는 비공개 RDS PostgreSQL 한 인스턴스.
# 서비스별 DB·role은 Terraform으로 만들지 않는다. 생성 후 deploy/shared-instance/rds-bootstrap.sql을 한 번 적용한다.

locals {
  rds_identifier                = "${local.name}-postgres"
  rds_major_version             = split(".", var.rds_engine_version)[0]
  rds_final_snapshot_identifier = var.rds_final_snapshot_identifier != "" ? var.rds_final_snapshot_identifier : "${local.rds_identifier}-final"
}

resource "aws_db_subnet_group" "this" {
  name        = local.rds_identifier
  description = "Private subnets for the shared PostgreSQL instance"
  subnet_ids  = aws_subnet.private[*].id

  tags = { Name = local.rds_identifier }
}

# 메이저 업그레이드 때 새 family 그룹을 먼저 만들고 바꿀 수 있도록 name_prefix와 create_before_destroy를 쓴다.
resource "aws_db_parameter_group" "this" {
  name_prefix = "${local.rds_identifier}-pg${local.rds_major_version}-"
  family      = "postgres${local.rds_major_version}"
  description = "Shared PostgreSQL ${local.rds_major_version}: TLS required"

  parameter {
    name         = "rds.force_ssl"
    value        = "1"
    apply_method = "immediate"
  }

  tags = { Name = local.rds_identifier }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_db_instance" "this" {
  identifier = local.rds_identifier

  engine                      = "postgres"
  engine_version              = var.rds_engine_version
  engine_lifecycle_support    = var.rds_engine_lifecycle_support
  auto_minor_version_upgrade  = true
  allow_major_version_upgrade = var.rds_allow_major_version_upgrade
  instance_class              = var.rds_instance_class
  parameter_group_name        = aws_db_parameter_group.this.name

  storage_type          = "gp3"
  allocated_storage     = var.rds_allocated_storage_gib
  max_allocated_storage = var.rds_max_allocated_storage_gib
  storage_encrypted     = true

  # 비밀번호는 RDS가 Secrets Manager에 만들고 회전한다. Terraform state에는 비밀의 ARN만 남는다.
  username                    = var.rds_master_username
  manage_master_user_password = true

  port                   = 5432
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  network_type           = "IPV4"
  multi_az               = var.rds_multi_az
  # Single-AZ면 EC2와 같은 AZ에 두어 AZ 간 전송 요금을 피한다. Multi-AZ에서는 지정할 수 없다.
  availability_zone = var.rds_multi_az ? null : var.availability_zones[0]

  backup_retention_period  = var.rds_backup_retention_days
  backup_window            = var.rds_backup_window
  maintenance_window       = var.rds_maintenance_window
  copy_tags_to_snapshot    = true
  delete_automated_backups = false

  deletion_protection       = var.rds_deletion_protection
  skip_final_snapshot       = false
  final_snapshot_identifier = local.rds_final_snapshot_identifier
  apply_immediately         = var.rds_apply_immediately

  # 유료 모니터링 기능은 기본으로 켜지 않는다.
  performance_insights_enabled = false
  monitoring_interval          = 0

  tags = { Name = local.rds_identifier }
}
