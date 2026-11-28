import caseFile from './case.json';

export const WET_MAP_ID = 'wet-map';
export const wetMap = caseFile;
export const wetMapCover = '/assets/wet-map-cover.webp';
export const wetMapMark = '/assets/wet-map-mark.webp';
export const wetMapPlates = '/assets/wet-map-plates.webp';

const clueIds = ['map-mark', 'plates', 'work-log'] as const;
export const wetMapSteps = [...clueIds, 'verdict'] as const;
export type TWetMapClue = (typeof clueIds)[number];
export type TWetMapStep = (typeof wetMapSteps)[number];

export const wetMapLabels = {
  'map-mark': '지도',
  plates: '표찰',
  'work-log': '일지',
  verdict: '추리',
} satisfies Record<TWetMapStep, string>;

export const wetMapLog = [
  { at: wetMap.rain.start, text: '비가 내리기 시작함' },
  { at: wetMap.rain.stop, text: '비가 그침' },
  ...wetMap.moves.map((at) => ({ at, text: '안내대에서 물건을 치움' })),
].sort((first, second) => first.at.localeCompare(second.at));

export const correctPlate = wetMap.plates.find(
  ({ width, height, notch }) =>
    width === wetMap.mark.width && height === wetMap.mark.height && notch === wetMap.mark.notch,
);
export const removalTime = wetMap.moves.find((at) => wetMap.rain.stop < at && at < wetMap.mark.foundAt);

interface IWetMapProgress {
  clues: TWetMapClue[];
  solved: boolean;
}

const storageKey = 'dawn-archive:wet-map:v1';
const emptyProgress: IWetMapProgress = { clues: [], solved: false };

export function isWetMapStep(value: unknown): value is TWetMapStep {
  return wetMapSteps.some((step) => step === value);
}

export function readWetMapProgress(): IWetMapProgress {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return emptyProgress;
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || !('clues' in saved) || !Array.isArray(saved.clues)) {
      return emptyProgress;
    }
    const seen: unknown[] = saved.clues;
    const clues = clueIds.filter((id) => seen.includes(id));
    return { clues, solved: clues.length === clueIds.length && 'solved' in saved && saved.solved === true };
  } catch {
    return emptyProgress;
  }
}

export function saveWetMapProgress(progress: IWetMapProgress) {
  const saved = readWetMapProgress();
  const next = {
    clues: clueIds.filter((id) => progress.clues.includes(id) || saved.clues.includes(id)),
    solved: progress.solved || saved.solved,
  };
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    // Keep the current investigation usable when storage is unavailable.
  }
  return next;
}

export function nextWetMapStep(progress: IWetMapProgress): TWetMapStep {
  return clueIds.find((step) => !progress.clues.includes(step)) ?? 'verdict';
}
