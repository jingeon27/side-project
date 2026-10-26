# 새 VPC: 공개 서브넷 1개(EC2). PostgreSQL은 EC2 안의 컨테이너라 VPC에 따로 노출할 서브넷이 없다.
# NAT 게이트웨이는 만들지 않는다.

locals {
  public_subnet_cidr = cidrsubnet(var.vpc_cidr, 24 - tonumber(split("/", var.vpc_cidr)[1]), 0)
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = local.name }
}

# 기본 보안 그룹은 쓰지 않는다. 규칙을 모두 비워 실수로 붙여도 통신하지 않게 한다.
resource "aws_default_security_group" "this" {
  vpc_id = aws_vpc.this.id

  tags = { Name = "${local.name}-default-unused" }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = { Name = local.name }
}

resource "aws_subnet" "public" {
  vpc_id            = aws_vpc.this.id
  cidr_block        = local.public_subnet_cidr
  availability_zone = var.availability_zone
  # EC2는 탄력적 IP를 연결한 네트워크 인터페이스로만 공개한다.
  map_public_ip_on_launch = false

  tags = {
    Name = "${local.name}-public-${var.availability_zone}"
    Tier = "public"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  tags = { Name = "${local.name}-public" }
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}
