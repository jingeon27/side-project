# 서비스별 비공개 S3 버킷. 설정은 deploy/shared-instance의 JSON과 각 프로젝트 s3-cors.json을 따른다.
# - 퍼블릭 접근 차단: s3-public-access.json
# - 수명 주기: s3-lifecycle.json(이전 버전·미완료 multipart만 정리, 현재 객체는 만료하지 않음)
# - CORS: projects/<service>/deploy/shared-instance/s3-cors.json(origin만 변수)
# DB 덤프용 backup 버킷은 파일 끝에 따로 둔다(CORS·서비스 IAM 사용자 없음).

locals {
  services = {
    game-feedback = {
      bucket = var.game_feedback_bucket_name
      domain = var.game_feedback_domain
      cors = {
        # 게시글·채팅 첨부 presigned POST와 presigned GET(Range)을 쓴다.
        allowed_origins = length(var.game_feedback_cors_origins) > 0 ? var.game_feedback_cors_origins : ["https://${var.game_feedback_domain}"]
        allowed_methods = ["POST", "GET", "HEAD"]
        allowed_headers = ["Content-Type", "Range"]
        expose_headers  = ["ETag", "Content-Length", "Content-Range"]
      }
    }
    photo-contest = {
      bucket = var.photo_contest_bucket_name
      domain = var.photo_contest_domain
      cors = {
        # 사진·동영상 presigned POST만 브라우저 CORS가 필요하다.
        allowed_origins = length(var.photo_contest_cors_origins) > 0 ? var.photo_contest_cors_origins : ["https://${var.photo_contest_domain}"]
        allowed_methods = ["POST"]
        allowed_headers = ["Content-Type"]
        expose_headers  = []
      }
    }
  }
}

resource "aws_s3_bucket" "service" {
  for_each = local.services

  bucket = each.value.bucket
  # 객체가 남아 있으면 버킷을 지우지 않는다(버전 관리 버킷은 이전 버전까지 비워야 삭제된다).
  force_destroy = false

  tags = {
    Name    = each.value.bucket
    Service = each.key
  }
}

resource "aws_s3_bucket_public_access_block" "service" {
  for_each = aws_s3_bucket.service

  bucket                  = each.value.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "service" {
  for_each = aws_s3_bucket.service

  bucket = each.value.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "service" {
  for_each = aws_s3_bucket.service

  bucket = each.value.id

  rule {
    # 앱은 SSE-S3를 쓴다. 고객 제공 키(SSE-C) 업로드는 막는다(2026년부터 새 버킷의 AWS 기본값과 같다).
    blocked_encryption_types = ["SSE-C"]

    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "service" {
  for_each = aws_s3_bucket.service

  bucket = each.value.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "service" {
  for_each = aws_s3_bucket.service

  bucket = each.value.id

  rule {
    id     = "retain-recoverable-versions"
    status = "Enabled"

    # 빈 filter는 s3-lifecycle.json의 "Filter": { "Prefix": "" }처럼 버킷 전체에 적용한다.
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.s3_noncurrent_version_retention_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  depends_on = [aws_s3_bucket_versioning.service]
}

resource "aws_s3_bucket_cors_configuration" "service" {
  for_each = aws_s3_bucket.service

  bucket = each.value.id

  cors_rule {
    allowed_origins = local.services[each.key].cors.allowed_origins
    allowed_methods = local.services[each.key].cors.allowed_methods
    allowed_headers = local.services[each.key].cors.allowed_headers
    expose_headers  = local.services[each.key].cors.expose_headers
    max_age_seconds = 300
  }
}

data "aws_iam_policy_document" "bucket_tls_only" {
  for_each = merge(aws_s3_bucket.service, { database-backup = aws_s3_bucket.backup })

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [each.value.arn, "${each.value.arn}/*"]

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

resource "aws_s3_bucket_policy" "service" {
  for_each = aws_s3_bucket.service

  bucket = each.value.id
  policy = data.aws_iam_policy_document.bucket_tls_only[each.key].json

  # 퍼블릭 정책 차단을 먼저 켠 뒤 정책을 붙인다. 이 정책은 Deny만 담으므로 차단에 걸리지 않는다.
  depends_on = [aws_s3_bucket_public_access_block.service]
}

# PostgreSQL 배포 전 덤프 버킷(pg-backup.sh). EC2 역할은 postgres/ 아래에 PutObject만 한다(iam.tf).
# 덤프는 postgres_dump_retention_days가 지나면 지우고, 덮어쓴 이전 버전은 서비스 버킷과 같은 기간 보존한다.
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
  policy = data.aws_iam_policy_document.bucket_tls_only["database-backup"].json

  depends_on = [aws_s3_bucket_public_access_block.backup]
}
