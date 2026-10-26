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

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/side-shared-mock"
    }
  }

  mock_resource "aws_ebs_volume" {
    defaults = {
      id = "vol-0123456789abcdef0"
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
  backup_bucket_name        = "example-side-database-backup"
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
    condition     = aws_cloudwatch_metric_alarm.host_instance_check.metric_name == "StatusCheckFailed_Instance" && aws_cloudwatch_metric_alarm.host_instance_check.evaluation_periods == 3 && aws_cloudwatch_metric_alarm.host_instance_check.dimensions["InstanceId"] == aws_instance.host.id && aws_cloudwatch_metric_alarm.host_instance_check.alarm_actions == toset(["arn:aws:automate:ap-northeast-2:ec2:reboot"])
    error_message = "Reboot the host after three failed instance status checks, without notifications by default"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.host_cpu_credits) == 1 && length(aws_sns_topic.alarms) == 0 && output.alarm_topic_arn == null
    error_message = "CPU credit alarm for burstable hosts; no SNS topic without an alarm email"
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
    condition     = aws_instance.host.credit_specification[0].cpu_credits == "standard" && aws_instance.host.instance_type == "t3.small"
    error_message = "Standard CPU credits on t3.small by default"
  }

  assert {
    condition     = aws_ebs_volume.postgres.encrypted && aws_ebs_volume.postgres.type == "gp3" && aws_ebs_volume.postgres.size == 20 && aws_ebs_volume.postgres.final_snapshot
    error_message = "Encrypted gp3 PostgreSQL volume that leaves a final snapshot"
  }

  assert {
    condition     = aws_ebs_volume.postgres.availability_zone == aws_subnet.public.availability_zone && aws_volume_attachment.postgres.instance_id == aws_instance.host.id && aws_volume_attachment.postgres.stop_instance_before_detaching
    error_message = "PostgreSQL volume attaches to the host in its AZ and never detaches from a running host"
  }

  assert {
    condition     = aws_dlm_lifecycle_policy.postgres.policy_details[0].target_tags["SnapshotPolicy"] == aws_ebs_volume.postgres.tags["SnapshotPolicy"] && one(aws_dlm_lifecycle_policy.postgres.policy_details[0].schedule[0].create_rule[0].times) == "17:00" && aws_dlm_lifecycle_policy.postgres.policy_details[0].schedule[0].retain_rule[0].count == 7
    error_message = "Daily snapshots of the PostgreSQL volume, seven kept"
  }

  assert {
    condition     = aws_s3_bucket_versioning.backup.versioning_configuration[0].status == "Enabled" && one(aws_s3_bucket_lifecycle_configuration.backup.rule).expiration[0].days == 30 && aws_s3_bucket_public_access_block.backup.restrict_public_buckets
    error_message = "Private, versioned backup bucket that expires dumps after 30 days"
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
    condition     = aws_subnet.public.cidr_block == "10.40.0.0/24" && aws_subnet.public.availability_zone == "ap-northeast-2a"
    error_message = "Public subnet CIDR and AZ"
  }

  assert {
    condition     = strcontains(output.host_env, "BACKUP_BUCKET=example-side-database-backup") && strcontains(output.host_env, "PHOTO_CONTEST_S3_BUCKET=example-side-photo-contest") && strcontains(output.host_env, "GAME_FEEDBACK_API_DOMAIN=api.game.bambyul.com") && !strcontains(output.host_env, "RDS_")
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
    alarm_email       = "operator@example.com"
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
    condition     = length(aws_sns_topic_subscription.alarm_email) == 1 && aws_sns_topic_subscription.alarm_email[0].endpoint == "operator@example.com"
    error_message = "Alarm email subscription"
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

run "short_snapshot_retention_rejected" {
  command = plan

  variables {
    postgres_snapshot_retention_count = 6
  }

  expect_failures = [var.postgres_snapshot_retention_count]
}

run "backup_bucket_reuse_rejected" {
  command = plan

  variables {
    backup_bucket_name = "example-side-photo-contest"
  }

  expect_failures = [var.backup_bucket_name]
}

run "hop_limit_rejected" {
  command = plan

  variables {
    metadata_hop_limit = 3
  }

  expect_failures = [var.metadata_hop_limit]
}

run "bad_snapshot_time_rejected" {
  command = plan

  variables {
    postgres_snapshot_time = "24:00"
  }

  expect_failures = [var.postgres_snapshot_time]
}

run "bad_alarm_email_rejected" {
  command = plan

  variables {
    alarm_email = "operator"
  }

  expect_failures = [var.alarm_email]
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
    availability_zone = "us-east-1a"
  }

  expect_failures = [var.availability_zone]
}
