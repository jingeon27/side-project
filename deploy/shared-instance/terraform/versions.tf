terraform {
  # 1.16.6으로 검증했다. S3 backend의 use_lockfile(1.11+)과 변수 간 validation(1.9+)을 쓴다.
  required_version = ">= 1.16.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.69"
    }
  }

  # Partial configuration. 값은 backend.hcl(backend.hcl.example 참고)로 넘긴다.
  backend "s3" {}
}
