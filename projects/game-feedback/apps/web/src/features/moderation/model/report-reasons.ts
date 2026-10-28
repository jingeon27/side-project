import type { ReportInput } from '@game-feedback/contracts';

interface IReportReasonOption {
  value: ReportInput['reason'];
  label: string;
}

export const reportReasons = [
  { value: 'HARASSMENT', label: '욕설 / 괴롭힘' },
  { value: 'IMPERSONATION', label: '사칭' },
  { value: 'FRAUD', label: '사기 / 거래 피해' },
  { value: 'SPAM', label: '스팸 / 광고' },
  { value: 'PERSONAL_INFORMATION', label: '개인정보 노출' },
  { value: 'OTHER', label: '기타' },
] as const satisfies readonly IReportReasonOption[];
