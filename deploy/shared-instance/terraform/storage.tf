# 공용 미디어 버킷 참조와 DB 덤프용 backup 버킷.
# 두 서비스는 기존 비공개 버킷 하나(media_bucket_name)를 서비스 폴더로 나눠 쓴다. Terraform은 이 버킷을 만들거나 설정하지
# 않고 서비스 IAM 사용자에게 자기 폴더 권한만 준다(iam.tf). 퍼블릭 접근 차단·암호화·버전 관리·수명 주기·CORS는
# deploy/shared-instance의 JSON과 각 프로젝트 s3-cors.json으로 콘솔에서 적용한다(README).

locals {
  media_bucket_arn = "arn:${data.aws_partition.current.partition}:s3:::${var.media_bucket_name}"
  # 운영 앱 compose의 GF_S3_KEY_PREFIX·S3_KEY_PREFIX 기본값과 같다. 로컬·CI는 같은 서비스 폴더의 local/·ci/를 쓴다.
  media_prefixes = {
    game-feedback = "game-feedback/production"
    photo-contest = "photo-contest/production"
  }
}

data "aws_iam_policy_document" "backup_tls_only" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.backup.arn, "${aws_s3_bucket.backup.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

# PostgreSQL 배포 전 덤프 버킷(pg-backup.sh). EC2 역할은 postgres/ 아래에 PutObject만 한다(iam.tf).
# 덤프는 postgres_dump_retention_days가 지나면 지우고, 덮어쓴 이전 버전은 s3_noncurrent_version_retention_days 동안 보존한다.
resource "aws_s3_bucket" "backup" {
  bucket        = var.backup_bucket_name
  force_destroy = false

  tags = {
    Name    = var.backup_bucket_name
    Service = "database-backup"
  }
}

resource "aws_s3_bucket_public_access_block" "backup" {
  bucket                  = aws_s3_bucket.backup.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "backup" {
  bucket = aws_s3_bucket.backup.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backup" {
  bucket = aws_s3_bucket.backup.id

  rule {
    blocked_encryption_types = ["SSE-C"]

    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "backup" {
  bucket = aws_s3_bucket.backup.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backup" {
  bucket = aws_s3_bucket.backup.id

  rule {
    id     = "expire-database-dumps"
    status = "Enabled"

    filter {
      prefix = "postgres/"
    }

    expiration {
      days = var.postgres_dump_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = var.s3_noncurrent_version_retention_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  depends_on = [aws_s3_bucket_versioning.backup]
}

resource "aws_s3_bucket_policy" "backup" {
  bucket = aws_s3_bucket.backup.id
  policy = data.aws_iam_policy_document.backup_tls_only.json

  depends_on = [aws_s3_bucket_public_access_block.backup]
}
