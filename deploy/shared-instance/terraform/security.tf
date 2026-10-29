# EC2는 Caddy의 80/443만 공개한다. 앱 포트(3200·3300·4200·4300), PostgreSQL 5432와 Docker API는 열지 않는다.
# AWS는 보안 그룹 설명에 ASCII만 허용하므로 설명은 영어로 쓴다.

resource "aws_security_group" "host" {
  name        = "${local.name}-host"
  description = "Shared EC2 host: public HTTP/HTTPS to Caddy, optional SSH"
  vpc_id      = aws_vpc.this.id

  tags = { Name = "${local.name}-host" }
}

resource "aws_vpc_security_group_ingress_rule" "host_web" {
  for_each = { http = 80, https = 443 }

  security_group_id = aws_security_group.host.id
  description       = "Public ${upper(each.key)} to Caddy"
  ip_protocol       = "tcp"
  from_port         = each.value
  to_port           = each.value
  cidr_ipv4         = "0.0.0.0/0"

  tags = { Name = "${local.name}-host-${each.key}" }
}

resource "aws_vpc_security_group_ingress_rule" "host_ssh" {
  for_each = toset(var.ssh_allowed_cidrs)

  security_group_id = aws_security_group.host.id
  description       = "SSH for operators and deploy runners"
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22
  cidr_ipv4         = each.value

  tags = { Name = "${local.name}-host-ssh" }
}

# 패키지·GHCR·ACME·S3(서비스·백업 버킷)·OAuth로 나가는 연결.
resource "aws_vpc_security_group_egress_rule" "host_all" {
  security_group_id = aws_security_group.host.id
  description       = "Outbound for packages, registry, ACME, S3 and OAuth"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"

  tags = { Name = "${local.name}-host-egress" }
}
