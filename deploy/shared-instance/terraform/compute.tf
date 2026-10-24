# 공용 EC2 호스트. Caddy와 두 서비스의 API·Web 컨테이너를 실행한다(DB·원본 미디어는 저장하지 않는다).

locals {
  # Canonical Ubuntu AMI의 기본 사용자. 배포 사용자(SIDE_DEPLOY_SSH_USER)로도 쓴다.
  ssh_user = "ubuntu"
}

data "aws_ssm_parameter" "host_ami" {
  name = var.ami_ssm_parameter
}

# SSM 파라미터가 가리키는 AMI가 Canonical 소유의 x86_64 이미지인지 확인한다.
data "aws_ami" "host" {
  owners = ["099720109477"] # Canonical

  filter {
    name   = "image-id"
    values = [data.aws_ssm_parameter.host_ami.insecure_value]
  }
}

data "aws_ec2_instance_type" "host" {
  instance_type = var.instance_type
}

resource "aws_key_pair" "operator" {
  count = var.ssh_public_key == "" ? 0 : 1

  key_name   = "${local.name}-operator"
  public_key = var.ssh_public_key

  tags = { Name = "${local.name}-operator" }
}

# 탄력적 IP를 먼저 연결한 네트워크 인터페이스로 부팅해 cloud-init이 처음부터 패키지 저장소에 닿게 한다.
resource "aws_network_interface" "host" {
  subnet_id       = aws_subnet.public.id
  security_groups = [aws_security_group.host.id]
  description     = "Shared EC2 host primary interface"

  tags = { Name = "${local.name}-host" }
}

resource "aws_eip" "host" {
  domain            = "vpc"
  network_interface = aws_network_interface.host.id

  tags = { Name = "${local.name}-host" }

  # 인터넷 게이트웨이가 VPC에 연결된 뒤에만 탄력적 IP를 연결할 수 있다.
  depends_on = [aws_internet_gateway.this]
}

resource "aws_instance" "host" {
  ami                  = data.aws_ami.host.id
  instance_type        = var.instance_type
  iam_instance_profile = aws_iam_instance_profile.host.name
  key_name             = one(aws_key_pair.operator[*].key_name)

  user_data = templatefile("${path.module}/templates/user-data.sh.tftpl", {
    deploy_user   = local.ssh_user
    swap_size_gib = var.swap_size_gib
  })
  user_data_replace_on_change = false

  disable_api_termination = var.instance_termination_protection
  monitoring              = false

  primary_network_interface {
    network_interface_id = aws_network_interface.host.id
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = var.metadata_hop_limit
    instance_metadata_tags      = "disabled"
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_size_gib
    encrypted             = true
    delete_on_termination = true

    tags = { Name = "${local.name}-host-root" }
  }

  dynamic "credit_specification" {
    for_each = data.aws_ec2_instance_type.host.burstable_performance_supported ? [var.instance_cpu_credits] : []

    content {
      cpu_credits = credit_specification.value
    }
  }

  tags = { Name = "${local.name}-host" }

  lifecycle {
    # 새 AMI 게시, user_data(첫 부팅에만 실행), 키 페어 변경으로 운영 호스트를 교체·재시작하지 않는다.
    # 교체가 필요하면 terraform apply -replace=aws_instance.host로 명시한다.
    ignore_changes = [ami, user_data, key_name]

    precondition {
      condition     = data.aws_ami.host.architecture == "x86_64"
      error_message = "운영 이미지가 linux/amd64이므로 AMI는 x86_64여야 한다."
    }

    precondition {
      condition     = contains(data.aws_ec2_instance_type.host.supported_architectures, "x86_64")
      error_message = "instance_type은 x86_64를 지원해야 한다(Graviton 등 arm64 타입은 쓸 수 없다)."
    }
  }

  depends_on = [aws_eip.host, aws_route.public_internet, aws_route_table_association.public]
}
