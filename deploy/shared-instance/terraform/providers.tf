provider "aws" {
  region              = var.region
  allowed_account_ids = length(var.allowed_account_ids) > 0 ? var.allowed_account_ids : null

  default_tags {
    tags = merge(var.tags, {
      Project    = "side-project"
      Stack      = "shared-instance"
      ManagedBy  = "terraform"
      Repository = "jingeon27/side-project"
    })
  }
}

locals {
  name = var.name_prefix
}
