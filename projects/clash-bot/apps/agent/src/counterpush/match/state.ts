import dayjs from 'dayjs';

// 경기 한 판의 진행 수치다. summary.json이 이 객체를 그대로 기록하므로 필드 순서도 기록 형식이다.
export type MatchState = {
  frames: number;
  actions: number;
  confirmed: number;
  abilityActions: number;
  abilityConfirmed: number;
  decisions: number;
  errors: number;
  seenBattle: boolean;
  result: string;
  blue: number;
  red: number;
  startedAt: number;
  inputPending: boolean;
  firstBattleAt: number;
  unconfirmed: number;
  waitingSince: number;
  waitingReportedAt: number;
  inputSuspended: boolean;
};

export const newMatchState = (): MatchState => ({
  frames: 0,
  actions: 0,
  confirmed: 0,
  abilityActions: 0,
  abilityConfirmed: 0,
  decisions: 0,
  errors: 0,
  seenBattle: false,
  result: 'unknown',
  blue: 0,
  red: 0,
  startedAt: dayjs().valueOf(),
  inputPending: false,
  firstBattleAt: 0,
  unconfirmed: 0,
  waitingSince: 0,
  waitingReportedAt: 0,
  inputSuspended: false,
});
