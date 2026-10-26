# EC2를 AWS 쪽에서 본다. 호스트가 멈추면 Sentry·Amplitude는 보낼 주체가 없어 조용해지므로 서버 수준 이상은 여기서 잡는다.
# 하드웨어(시스템 상태 검사) 장애는 EC2 기본 자동 복구가 같은 인스턴스·탄력적 IP·볼륨으로 처리하므로 알람을 따로 두지 않는다.
# 재부팅 동작은 서비스 연결 역할 AWSServiceRoleForCloudWatchEvents를 쓴다. 처음 만들 때 실행 주체에 iam:CreateServiceLinkedRole이 필요하다.

locals {
  # 비어 있으면 알림 없이 재부팅만 한다.
  alarm_topic_arns = aws_sns_topic.alarms[*].arn
}

resource "aws_sns_topic" "alarms" {
  count = var.alarm_email == "" ? 0 : 1

  name = "${local.name}-alarms"

  tags = { Name = "${local.name}-alarms" }
}

# 적용 후 받은 확인 메일의 링크를 눌러야 구독이 시작된다.
resource "aws_sns_topic_subscription" "alarm_email" {
  count = length(aws_sns_topic.alarms)

  topic_arn = aws_sns_topic.alarms[0].arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# 커널 정지·메모리 고갈로 인스턴스 상태 검사가 1분 단위 3번 연속 실패하면 재부팅한다(AWS 권장값).
# 상태 검사 지표는 기본 모니터링에서도 1분 간격이다. 지표가 잠시 빠져도 재부팅하지 않도록 missing으로 둔다.
resource "aws_cloudwatch_metric_alarm" "host_instance_check" {
  alarm_name          = "${local.name}-host-instance-check"
  alarm_description   = "Reboot the shared host after three failed instance status checks"
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_Instance"
  dimensions          = { InstanceId = aws_instance.host.id }
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 3
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "missing"
  alarm_actions       = concat(["arn:${data.aws_partition.current.partition}:automate:${var.region}:ec2:reboot"], local.alarm_topic_arns)
  ok_actions          = local.alarm_topic_arns

  tags = { Name = "${local.name}-host-instance-check" }
}

# standard 크레딧 모드는 크레딧이 바닥나면 기준 성능으로 조용히 느려진다. 앱 지표에는 느린 요청으로만 보이므로 원인을 여기서 알린다.
# 인스턴스를 새로 만든 직후에는 잔액이 낮아 잠시 울릴 수 있다.
resource "aws_cloudwatch_metric_alarm" "host_cpu_credits" {
  count = data.aws_ec2_instance_type.host.burstable_performance_supported ? 1 : 0

  alarm_name          = "${local.name}-host-cpu-credits"
  alarm_description   = "CPU credits of the shared host are running out"
  namespace           = "AWS/EC2"
  metric_name         = "CPUCreditBalance"
  dimensions          = { InstanceId = aws_instance.host.id }
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 3
  threshold           = var.cpu_credit_alarm_threshold
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "missing"
  alarm_actions       = local.alarm_topic_arns
  ok_actions          = local.alarm_topic_arns

  tags = { Name = "${local.name}-host-cpu-credits" }
}
