export const RETURNED_KEY_ID = 'returned-key';
export const returnedKeyTitle = '새벽 세 시에 돌아온 열쇠';
export const envelopeImage = '/assets/returned-key-envelope.webp';
export const dropboxImage = '/assets/returned-key-dropbox.webp';

const clueIds = ['envelope', 'dropboxes', 'night-log'] as const;
export type TReturnedKeyClue = (typeof clueIds)[number];
export const returnedKeySteps = [...clueIds, 'verdict'] as const;
export type TReturnedKeyStep = (typeof returnedKeySteps)[number];

export const returnedKeyLabels = {
  envelope: '봉투',
  dropboxes: '반납함',
  'night-log': '야간 일지',
  verdict: '추리',
} satisfies Record<TReturnedKeyStep, string>;

export const returnSlots = [
  { id: 'front', name: '정문 반납함', color: 'gray', shape: 'crescent' },
  { id: 'alley', name: '골목 반납함', color: 'blue', shape: 'crescent' },
  { id: 'lobby', name: '로비 반납함', color: 'blue', shape: 'square' },
] as const;

export const stampColors = { gray: '회색', blue: '파란색' } as const;
export const stampShapes = { crescent: '반달', square: '사각형' } as const;

export const jobCodes = {
  D1: { id: 'lock', label: '출입문 잠금' },
  A2: { id: 'deposit', label: '투입 감지' },
  R3: { id: 'collection', label: '수거 봉투 등록' },
} as const;

export const nightLog = [
  { at: '22:00', code: 'D1', note: '출입문 2곳' },
  { at: '02:52', code: 'A2', note: '봉투 1개' },
  { at: '03:00', code: 'R3', note: '봉투 1개' },
] as const satisfies readonly { at: string; code: keyof typeof jobCodes; note: string }[];

export interface IReturnedKeyProgress {
  clues: TReturnedKeyClue[];
  solved: boolean;
}

const progressKey = 'dawn-archive:returned-key:v1';
const emptyProgress: IReturnedKeyProgress = { clues: [], solved: false };

export function isReturnedKeyStep(value: unknown): value is TReturnedKeyStep {
  return returnedKeySteps.some((step) => step === value);
}

export function readReturnedKeyProgress(): IReturnedKeyProgress {
  try {
    const saved = window.localStorage.getItem(progressKey);
    if (!saved) return emptyProgress;
    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object' || !('clues' in parsed) || !Array.isArray(parsed.clues)) {
      return emptyProgress;
    }
    const serializedClues: unknown[] = parsed.clues;
    const firstMissing = clueIds.findIndex((clue) => !serializedClues.includes(clue));
    return {
      clues: clueIds.slice(0, firstMissing === -1 ? clueIds.length : firstMissing),
      solved: firstMissing === -1 && 'solved' in parsed && parsed.solved === true,
    };
  } catch {
    return emptyProgress;
  }
}

export function saveReturnedKeyProgress(progress: IReturnedKeyProgress) {
  const saved = readReturnedKeyProgress();
  const next = {
    clues: clueIds.filter((clue) => progress.clues.includes(clue) || saved.clues.includes(clue)),
    solved: progress.solved || saved.solved,
  };
  try {
    window.localStorage.setItem(progressKey, JSON.stringify(next));
  } catch {
    // Investigation can still continue when storage is blocked.
  }
  return next;
}

export function nextReturnedKeyStep(progress: IReturnedKeyProgress): TReturnedKeyStep {
  return clueIds.find((clue) => !progress.clues.includes(clue)) ?? 'verdict';
}

export function canOpenReturnedKeyStep(step: TReturnedKeyStep, progress: IReturnedKeyProgress) {
  return returnedKeySteps.indexOf(step) <= returnedKeySteps.indexOf(nextReturnedKeyStep(progress));
}

export function returnedKeyVerdictIsCorrect(slotId: string, jobId: string) {
  const slot = returnSlots.find(({ id }) => id === slotId);
  const entry = nightLog.find(({ at }) => at === '03:00');
  if (!slot || !entry) return false;
  return slot.color === 'blue' && slot.shape === 'crescent' && jobCodes[entry.code].id === jobId;
}
