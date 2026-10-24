# EC2 인스턴스 역할은 RDS 복구 지점 조회(rds-read-policy.json)만 한다. DB 비밀번호·S3 권한은 넣지 않는다.
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
  description          = "Shared EC2 host: RDS recovery point checks"
  assume_role_policy   = data.aws_iam_policy_document.host_assume_role.json
  max_session_duration = 3600

  tags = { Name = "${local.name}-host" }
}

# rds-read-policy.json과 같은 권한을 이 RDS 인스턴스로 좁힌다.
data "aws_iam_policy_document" "host_rds_read" {
  statement {
    sid       = "DescribeSharedDatabase"
    actions   = ["rds:DescribeDBInstances"]
    resources = [aws_db_instance.this.arn]

    condition {
      test     = "StringEquals"
      variable = "aws:RequestedRegion"
      values   = [var.region]
    }
  }
}

resource "aws_iam_role_policy" "host_rds_read" {
  name   = "rds-recovery-point-read"
  role   = aws_iam_role.host.id
  policy = data.aws_iam_policy_document.host_rds_read.json
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
