import caseFile from './case.json';

export const WET_MAP_ID = 'wet-map';
export const wetMap = caseFile;
export const wetMapCover = '/assets/wet-map-cover.webp';
export const wetMapMark = '/assets/wet-map-mark.webp';
export const wetMapPlates = '/assets/wet-map-plates.webp';

export type TWetMapClue = 'map-mark' | 'plates' | 'work-log';

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
