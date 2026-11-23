export const CASE_ID = 'last-receipt';
export const playPath = '/play/';

export const clueIds = ['receipt', 'printers', 'record'] as const;
export type TEvidence = (typeof clueIds)[number];
export const stepIds = [...clueIds, 'verdict'] as const;
export type TCaseStep = (typeof stepIds)[number];
export type TCaseRoute = 'landing' | TCaseStep;
export type TLaunchIntent = 'start' | 'resume' | 'ending';
export const recordIds = ['ledger', 'log', 'codes'] as const;
export type TRecordDocument = (typeof recordIds)[number];

export const receipt = {
  printDate: '2026.11.21',
  printTime: '02:13',
  printDateTime: '2026-11-21T02:13:00+09:00',
  tradeDate: '2016.11.20',
  tradeTime: '19:46',
  tradeDateTime: '2016-11-20T19:46:00+09:00',
  serial: 'RD-07',
} as const;

export const stepLabels = {
  receipt: '영수증',
  printers: '프린터',
  record: '이관 기록',
  verdict: '추리',
} satisfies Record<TCaseStep, string>;

export function isEvidence(value: unknown): value is TEvidence {
  return clueIds.some((clue) => clue === value);
}

export function isCaseStep(value: unknown): value is TCaseStep {
  return stepIds.some((step) => step === value);
}

export function isRecordDocument(value: unknown): value is TRecordDocument {
  return recordIds.some((document) => document === value);
}
export type TProp = 'desk' | 'receipt' | 'printer-a' | 'printer-b' | 'record';
export type TRenderer = 'unity' | 'webgl' | 'photo';

export interface IOrientation {
  yaw: number;
  pitch: number;
  underside: boolean;
}

export const front: IOrientation = { yaw: 0, pitch: 0, underside: false };

export const printers = {
  'printer-a': { name: '프린터 A', serial: 'MX-41' },
  'printer-b': { name: '프린터 B', serial: 'RD-07' },
} as const;

export type TPrinter = keyof typeof printers;
export const printerIds = ['printer-a', 'printer-b'] as const satisfies readonly TPrinter[];

export const places = [
  { value: 'bookshop', label: '폐점한 노을서점' },
  { value: 'archive', label: '동명기록관' },
  { value: 'warehouse', label: '서북 물류창고' },
];

export const reasons = [
  { value: 'sale', label: '현장 판매' },
  { value: 'reprint', label: '보관 거래 복원' },
  { value: 'test', label: '용지 정렬 점검' },
  { value: 'close', label: '마감 정산' },
];

const progressKey = 'dawn-archive:last-receipt:v1';

export interface IProgress {
  clues: TEvidence[];
  solved: boolean;
  followed: boolean;
  viewedBottoms: TPrinter[];
  recordDocuments: TRecordDocument[];
}

const emptyProgress: IProgress = {
  clues: [],
  solved: false,
  followed: false,
  viewedBottoms: [],
  recordDocuments: [],
};

export function restartProgress(followed: boolean): IProgress {
  return { ...emptyProgress, followed };
}

export function readProgress(): IProgress {
  try {
    const saved = window.localStorage.getItem(progressKey);
    if (!saved) return emptyProgress;
    const parsed: Partial<IProgress> = JSON.parse(saved);
    if (!parsed || !Array.isArray(parsed.clues)) return emptyProgress;
    const viewedBottoms = printerIds.filter(
      (key) => Array.isArray(parsed.viewedBottoms) && parsed.viewedBottoms.includes(key),
    );
    const savedClues = parsed.clues;
    const savedDocuments = parsed.recordDocuments;
    const recordDocuments = Array.isArray(savedDocuments)
      ? recordIds.filter((key) => savedDocuments.includes(key))
      : recordIds.filter((key) => key === 'ledger' && savedClues.includes('record'));
    const clues = clueIds.filter((key) => {
      if (key === 'record') {
        return (
          recordDocuments.length === recordIds.length || (parsed.solved === true && savedClues.includes(key))
        );
      }
      return savedClues.includes(key) || (key === 'printers' && viewedBottoms.length === printerIds.length);
    });
    return {
      clues,
      solved: parsed.solved === true && clues.length === clueIds.length,
      followed: parsed.followed === true,
      viewedBottoms,
      recordDocuments,
    };
  } catch {
    return emptyProgress;
  }
}

export function investigationIntent(progress: IProgress): TLaunchIntent {
  if (progress.solved) return 'ending';
  return progress.clues.length || progress.viewedBottoms.length ? 'resume' : 'start';
}

export function nextInvestigationStep(progress: IProgress): TCaseStep {
  return clueIds.find((clue) => !progress.clues.includes(clue)) ?? 'verdict';
}

export function canOpenStep(step: TCaseStep, progress: IProgress) {
  if (isEvidence(step) && progress.clues.includes(step)) return true;
  return stepIds.indexOf(step) <= stepIds.indexOf(nextInvestigationStep(progress));
}

export function saveProgress(progress: IProgress) {
  try {
    window.localStorage.setItem(progressKey, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

export function classifySource(value: string | null) {
  if (value === 'youtube-shorts') return 'youtube_shorts';
  if (value === 'shared') return 'shared';
  if (value === 'community') return 'community';
  return 'direct';
}
