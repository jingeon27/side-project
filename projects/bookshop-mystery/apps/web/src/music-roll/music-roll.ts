import caseFile from './case.json';

export const MUSIC_ROLL_ID = 'music-roll';
export const musicRoll = caseFile;
export const musicRollCover = '/assets/music-roll-cover.webp';
export type TMusicClue = 'bell-record' | 'feed-guide' | 'paper-rolls';
export type TRollDirection = 'left' | 'right';

export const directions = {
  left: '왼쪽 끝부터',
  right: '오른쪽 끝부터',
} satisfies Record<TRollDirection, string>;

export function playbackTimes(holes: readonly number[], direction: TRollDirection) {
  const length = Math.max(...holes);
  const first = Math.min(...holes);
  return direction === 'left'
    ? holes.map((position) => (position - first) * musicRoll.secondsPerCell)
    : holes.toReversed().map((position) => (length - position) * musicRoll.secondsPerCell);
}

export function matchesRecording(times: readonly number[]) {
  return (
    times.length === musicRoll.strikes.length &&
    times.every((time, index) => time === musicRoll.strikes[index])
  );
}
