# 두 서비스가 함께 쓰는 PostgreSQL 컨테이너의 데이터 볼륨. EC2 루트 볼륨과 분리해 인스턴스를 교체해도 남긴다.
# 첫 부팅의 user_data가 포맷·마운트하고, 컨테이너·서비스별 DB·role은 deploy/shared-instance/scripts/database.sh가 만든다.
# 백업은 두 겹이다: DLM 일일 스냅샷(이 파일)과 배포마다 migration 직전의 논리 덤프(pg-backup.sh → backup 버킷).

locals {
  postgres_name = "${local.name}-postgres"
}

resource "aws_ebs_volume" "postgres" {
  availability_zone = var.availability_zone
  type              = "gp3"
  size              = var.postgres_volume_size_gib
  encrypted         = true
  # 교체·파기로 볼륨이 지워질 때 마지막 스냅샷을 남긴다.
  final_snapshot = true

  tags = {
    Name           = local.postgres_name
    SnapshotPolicy = local.postgres_name
  }
}

resource "aws_volume_attachment" "postgres" {
  # Nitro 인스턴스에서는 /dev/nvme*n1로 보이므로 user_data는 볼륨 ID(by-id)로 장치를 찾는다.
  device_name = "/dev/sdf"
  volume_id   = aws_ebs_volume.postgres.id
  instance_id = aws_instance.host.id
  # 떼어야 할 때(교체·파기) 인스턴스를 먼저 멈춰 PostgreSQL이 쓰는 도중에 분리하지 않는다.
  stop_instance_before_detaching = true
}

# 실행 중인 볼륨의 crash-consistent 스냅샷이다. 데이터와 WAL이 같은 볼륨에 있으므로 복원하면 PostgreSQL이 WAL로 복구한다.
resource "aws_dlm_lifecycle_policy" "postgres" {
  description        = "Daily snapshots of the shared PostgreSQL volume"
  execution_role_arn = aws_iam_role.dlm.arn
  state              = "ENABLED"

  policy_details {
    resource_types = ["VOLUME"]
    target_tags    = { SnapshotPolicy = local.postgres_name }

    schedule {
      name      = "daily"
      copy_tags = true

      create_rule {
        interval      = 24
        interval_unit = "HOURS"
        times         = [var.postgres_snapshot_time]
      }

      retain_rule {
        count = var.postgres_snapshot_retention_count
      }

      tags_to_add = { SnapshotCreator = "dlm" }
    }
  }

  tags = { Name = local.postgres_name }

  depends_on = [aws_iam_role_policy_attachment.dlm]
}
