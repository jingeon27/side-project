# EC2 인스턴스 역할은 배포 전 DB 덤프를 backup 버킷에 올리기만 한다(backup-write-policy.json). DB 비밀번호·서비스 버킷 권한은 넣지 않는다.
# 서비스별 IAM 사용자는 자기 버킷만 읽고 쓴다(s3-app-policy.json).
# 액세스 키는 만들지 않는다. Terraform으로 만들면 비밀 키가 state에 평문으로 남는다. README의 발급 절차를 따른다.

data "aws_partition" "current" {}

data "aws_iam_policy_document" "host_assume_role" {
  statement {
    sid     = "EC2AssumeRole"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "host" {
  name                 = "${local.name}-host"
  description          = "Shared EC2 host: database dump uploads"
  assume_role_policy   = data.aws_iam_policy_document.host_assume_role.json
  max_session_duration = 3600

  tags = { Name = "${local.name}-host" }
}

# backup-write-policy.json과 같은 권한. 호스트가 침해돼도 기존 덤프를 읽거나 지우지 못하고, 덮어쓴 객체는 버전 관리로 되돌린다.
data "aws_iam_policy_document" "host_backup_write" {
  statement {
    sid       = "UploadDatabaseDumps"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.backup.arn}/postgres/*"]
  }
}

resource "aws_iam_role_policy" "host_backup_write" {
  name   = "database-dump-upload"
  role   = aws_iam_role.host.id
  policy = data.aws_iam_policy_document.host_backup_write.json
}

resource "aws_iam_role_policy_attachment" "host_ssm" {
  count = var.enable_ssm_session_manager ? 1 : 0

  role       = aws_iam_role.host.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "host" {
  name = "${local.name}-host"
  role = aws_iam_role.host.name

  tags = { Name = "${local.name}-host" }
}

# Data Lifecycle Manager가 PostgreSQL 볼륨 스냅샷을 만들고 보존 개수를 넘은 스냅샷을 지운다.
data "aws_iam_policy_document" "dlm_assume_role" {
  statement {
    sid     = "DLMAssumeRole"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["dlm.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "dlm" {
  name               = "${local.name}-dlm"
  description        = "Data Lifecycle Manager: PostgreSQL volume snapshots"
  assume_role_policy = data.aws_iam_policy_document.dlm_assume_role.json

  tags = { Name = "${local.name}-dlm" }
}

resource "aws_iam_role_policy_attachment" "dlm" {
  role       = aws_iam_role.dlm.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AWSDataLifecycleManagerServiceRole"
}

resource "aws_iam_user" "s3" {
  for_each = aws_s3_bucket.service

  name = "${local.name}-${each.key}-s3"
  path = "/side-project/"
  # 콘솔·CLI로 발급한 액세스 키가 남아 있으면 삭제를 멈춘다. 파기 전에 키를 먼저 비활성화·삭제한다.
  force_destroy = false

  tags = {
    Name    = "${local.name}-${each.key}-s3"
    Service = each.key
  }
}

data "aws_iam_policy_document" "s3_app" {
  for_each = aws_s3_bucket.service

  statement {
    sid       = "ListOwnBucket"
    actions   = ["s3:ListBucket"]
    resources = [each.value.arn]
  }

  statement {
    sid       = "ReadWriteOwnObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${each.value.arn}/*"]
  }
}

resource "aws_iam_user_policy" "s3_app" {
  for_each = aws_iam_user.s3

  name   = "s3-app-own-bucket"
  user   = each.value.name
  policy = data.aws_iam_policy_document.s3_app[each.key].json
}
