# AWS 자격 증명 없이 기본값·검증 규칙·사전 조건을 확인한다(terraform test).
# mock provider는 AWS API를 호출하지 않으며 data source·계산 속성에 아래 가짜 값을 쓴다.
# 실제 AWS의 계정 한도·AMI·인스턴스 타입·IAM 동작은 terraform plan/apply에서 따로 확인한다.

mock_provider "aws" {
  mock_data "aws_ami" {
    defaults = {
      id           = "ami-0123456789abcdef0"
      architecture = "x86_64"
    }
  }

  mock_data "aws_ec2_instance_type" {
    defaults = {
      supported_architectures         = ["i386", "x86_64"]
      burstable_performance_supported = true
    }
  }

  mock_data "aws_ssm_parameter" {
    defaults = {
      insecure_value = "ami-0123456789abcdef0"
    }
  }

  mock_data "aws_partition" {
    defaults = {
      partition = "aws"
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_data "aws_route53_zone" {
    defaults = {
      name = "bambyul.com"
    }
  }

  mock_resource "aws_db_instance" {
    defaults = {
      arn                = "arn:aws:rds:ap-northeast-2:123456789012:db:side-shared-postgres"
      address            = "side-shared-postgres.abc.ap-northeast-2.rds.amazonaws.com"
      master_user_secret = [{ kms_key_id = "k", secret_arn = "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:rds!db-x", secret_status = "active" }]
    }
  }

  mock_resource "aws_s3_bucket" {
    defaults = {
      arn = "arn:aws:s3:::mock-bucket"
    }
  }

  mock_resource "aws_eip" {
    defaults = {
      public_ip = "203.0.113.10"
    }
  }
}

variables {
  game_feedback_bucket_name = "example-side-game-feedback"
  photo_contest_bucket_name = "example-side-photo-contest"
}

run "defaults" {
  command = apply

  assert {
    condition     = length(aws_vpc_security_group_ingress_rule.host_ssh) == 0
    error_message = "SSH rule must not exist by default"
  }

  assert {
    condition     = length(aws_route53_record.service) == 0 && output.dns_managed_by_terraform == false
    error_message = "DNS records must not exist without a zone"
  }

  assert {
    condition     = length(aws_key_pair.operator) == 0
    error_message = "No key pair by default"
  }

  assert {
    condition     = length(aws_iam_role_policy_attachment.host_ssm) == 1
    error_message = "SSM attached by default"
  }

  assert {
    condition     = aws_instance.host.metadata_options[0].http_tokens == "required" && aws_instance.host.metadata_options[0].http_put_response_hop_limit == 1
    error_message = "IMDSv2 required with hop limit 1"
  }

  assert {
    condition     = aws_instance.host.root_block_device[0].encrypted && aws_instance.host.root_block_device[0].volume_type == "gp3"
    error_message = "Encrypted gp3 root volume"
  }

  assert {
    condition     = aws_instance.host.credit_specification[0].cpu_credits == "standard"
    error_message = "Standard CPU credits by default"
  }

  assert {
    condition     = aws_db_instance.this.engine_version == "18" && aws_db_parameter_group.this.family == "postgres18"
    error_message = "PostgreSQL 18 family"
  }

  assert {
    condition     = aws_db_instance.this.availability_zone == "ap-northeast-2a" && !aws_db_instance.this.multi_az
    error_message = "Single-AZ RDS in the EC2 AZ"
  }

  assert {
    condition     = aws_db_instance.this.final_snapshot_identifier == "side-shared-postgres-final" && aws_db_instance.this.deletion_protection && !aws_db_instance.this.publicly_accessible && aws_db_instance.this.storage_encrypted && aws_db_instance.this.manage_master_user_password
    error_message = "RDS safety defaults"
  }

  assert {
    condition     = one(aws_s3_bucket_cors_configuration.service["game-feedback"].cors_rule).allowed_origins == toset(["https://game.bambyul.com"])
    error_message = "GF CORS origin defaults to the web domain"
  }

  assert {
    condition     = one(aws_s3_bucket_cors_configuration.service["photo-contest"].cors_rule).allowed_methods == toset(["POST"])
    error_message = "PC CORS allows POST only"
  }

  assert {
    condition     = aws_subnet.public.cidr_block == "10.40.0.0/24" && aws_subnet.private[0].cidr_block == "10.40.10.0/24" && aws_subnet.private[1].cidr_block == "10.40.11.0/24"
    error_message = "Subnet CIDRs"
  }

  assert {
    condition     = strcontains(output.host_env, "RDS_INSTANCE_ID=side-shared-postgres") && strcontains(output.host_env, "PHOTO_CONTEST_S3_BUCKET=example-side-photo-contest") && strcontains(output.host_env, "GAME_FEEDBACK_API_DOMAIN=api.game.bambyul.com")
    error_message = "host_env output"
  }

  assert {
    condition     = output.github_environment_variables.SIDE_DEPLOY_HOST == "203.0.113.10" && output.github_environment_variables.SIDE_DEPLOY_SSH_USER == "ubuntu"
    error_message = "GitHub environment variables output"
  }
}

run "dns_and_ssh" {
  command   = plan
  state_key = "fresh"

  variables {
    route53_zone_id   = "Z0123456789ABCDEFGHIJ"
    ssh_allowed_cidrs = ["203.0.113.10/32", "198.51.100.0/24"]
    ssh_public_key    = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleExampleExampleExampleExampleExample operator"
    rds_multi_az      = true
  }

  assert {
    condition     = length(aws_route53_record.service) == 4
    error_message = "Four DNS records"
  }

  assert {
    condition     = length(aws_vpc_security_group_ingress_rule.host_ssh) == 2 && length(aws_key_pair.operator) == 1
    error_message = "SSH rules and key pair"
  }

  assert {
    condition     = aws_db_instance.this.multi_az
    error_message = "Multi-AZ RDS"
  }
}

run "zone_mismatch" {
  command = plan

  variables {
    route53_zone_id = "Z0123456789ABCDEFGHIJ"
  }

  override_data {
    target = data.aws_route53_zone.this[0]
    values = { name = "example.com." }
  }

  expect_failures = [aws_route53_record.service]
}

run "arm_instance_rejected" {
  command = plan

  variables {
    instance_type = "t4g.medium"
  }

  override_data {
    target = data.aws_ec2_instance_type.host
    values = { supported_architectures = ["arm64"], burstable_performance_supported = true }
  }

  expect_failures = [aws_instance.host]
}

run "same_bucket_rejected" {
  command = plan

  variables {
    photo_contest_bucket_name = "example-side-game-feedback"
  }

  expect_failures = [var.photo_contest_bucket_name]
}

run "short_backup_rejected" {
  command = plan

  variables {
    rds_backup_retention_days = 6
  }

  expect_failures = [var.rds_backup_retention_days]
}

run "hop_limit_rejected" {
  command = plan

  variables {
    metadata_hop_limit = 3
  }

  expect_failures = [var.metadata_hop_limit]
}

run "storage_autoscaling_rejected" {
  command = plan

  variables {
    rds_max_allocated_storage_gib = 20
  }

  expect_failures = [var.rds_max_allocated_storage_gib]
}

run "bad_cors_origin_rejected" {
  command = plan

  variables {
    game_feedback_cors_origins = ["https://game.bambyul.com/"]
  }

  expect_failures = [var.game_feedback_cors_origins]
}

run "bad_vpc_cidr_rejected" {
  command = plan

  variables {
    vpc_cidr = "10.40.1.0/16"
  }

  expect_failures = [var.vpc_cidr]
}

run "az_outside_region_rejected" {
  command = plan

  variables {
    availability_zones = ["us-east-1a", "us-east-1b"]
  }

  expect_failures = [var.availability_zones]
}
