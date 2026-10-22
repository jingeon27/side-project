# 새 VPC: 공개 서브넷 1개(EC2), 서로 다른 AZ의 비공개 서브넷 2개(RDS).
# NAT 게이트웨이는 만들지 않는다. 비공개 서브넷의 RDS는 인터넷으로 나가지 않는다.

locals {
  subnet_newbits       = 24 - tonumber(split("/", var.vpc_cidr)[1])
  public_subnet_cidr   = cidrsubnet(var.vpc_cidr, local.subnet_newbits, 0)
  private_subnet_cidrs = [for index in range(2) : cidrsubnet(var.vpc_cidr, local.subnet_newbits, 10 + index)]
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
  availability_zone = var.availability_zones[0]
  # EC2는 탄력적 IP를 연결한 네트워크 인터페이스로만 공개한다.
  map_public_ip_on_launch = false

  tags = {
    Name = "${local.name}-public-${var.availability_zones[0]}"
    Tier = "public"
  }
}

resource "aws_subnet" "private" {
  count = 2

  vpc_id            = aws_vpc.this.id
  cidr_block        = local.private_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]

  tags = {
    Name = "${local.name}-private-${var.availability_zones[count.index]}"
    Tier = "private"
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

# VPC 내부 경로만 있는 라우팅 테이블. 기본(main) 라우팅 테이블에 기대지 않고 명시한다.
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.this.id

  tags = { Name = "${local.name}-private" }
}

resource "aws_route_table_association" "private" {
  count = 2

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}
