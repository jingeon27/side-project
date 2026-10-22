# route53_zone_id가 있으면 네 호스트의 A 레코드를 탄력적 IP로 만든다. 없으면 만들지 않는다.
# API 호스트는 api.<웹 도메인> 규칙을 따른다(proxy.sh가 검사한다).

locals {
  manage_dns = var.route53_zone_id != ""
  dns_hosts = {
    game-feedback-web = var.game_feedback_domain
    game-feedback-api = "api.${var.game_feedback_domain}"
    photo-contest-web = var.photo_contest_domain
    photo-contest-api = "api.${var.photo_contest_domain}"
  }
}

data "aws_route53_zone" "this" {
  count = local.manage_dns ? 1 : 0

  zone_id = var.route53_zone_id
}

resource "aws_route53_record" "service" {
  for_each = local.manage_dns ? local.dns_hosts : {}

  zone_id = var.route53_zone_id
  name    = each.value
  type    = "A"
  ttl     = var.dns_ttl
  records = [aws_eip.host.public_ip]

  lifecycle {
    precondition {
      condition     = each.value == trimsuffix(data.aws_route53_zone.this[0].name, ".") || endswith(each.value, ".${trimsuffix(data.aws_route53_zone.this[0].name, ".")}")
      error_message = "${each.value}는 호스팅 영역 ${data.aws_route53_zone.this[0].name} 안의 이름이어야 한다."
    }
  }
}
