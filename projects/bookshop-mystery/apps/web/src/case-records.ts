import { printers, receipt, type TRecordDocument } from './case-file';

export const recordLabels = {
  ledger: '이관 대장',
  log: '작업일지',
  codes: '코드표',
} satisfies Record<TRecordDocument, string>;

export const transferLedger = [
  { serial: printers['printer-a'].serial, place: 'warehouse', location: '서북 물류창고', date: '2017.01.04' },
  { serial: printers['printer-b'].serial, place: 'archive', location: '동명기록관', date: '2017.01.12' },
] as const;

export const workCodes = {
  T01: { reason: 'test', description: '용지 정렬을 점검한다. 시험 무늬와 현재 시각만 인쇄한다.' },
  R02: { reason: 'reprint', description: '보관한 거래를 불러온다. 출력물에 최초 거래 시각이 남는다.' },
  C03: { reason: 'close', description: '정산 합계를 인쇄한다. 개별 거래 항목은 제외한다.' },
} as const;

export const workLog = [
  { id: 'paper-check', at: '02:07', serial: printers['printer-b'].serial, code: 'T01' },
  { id: 'alignment', at: '02:13', serial: printers['printer-a'].serial, code: 'T01' },
  { id: 'import', at: '02:13', serial: printers['printer-b'].serial, code: 'R02' },
  { id: 'totals', at: '02:19', serial: printers['printer-b'].serial, code: 'C03' },
] as const satisfies readonly { id: string; at: string; serial: string; code: keyof typeof workCodes }[];

export function verdictIsCorrect(place: string, jobId: string, reason: string) {
  const job = workLog.find((entry) => entry.at === receipt.printTime && entry.serial === receipt.serial);
  const transfer = transferLedger.find((entry) => entry.serial === receipt.serial);
  return !!job && job.id === jobId && transfer?.place === place && workCodes[job.code].reason === reason;
}
