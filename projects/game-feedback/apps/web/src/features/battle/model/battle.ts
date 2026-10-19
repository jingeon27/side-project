import { BattleModeSchema, type TBattleMode } from '@game-feedback/contracts';

const labels = { DUEL: '1:1', TEAM: '팀전' } satisfies Record<TBattleMode, string>;

export function battleModeLabel(mode: TBattleMode) {
  return labels[mode];
}

export function parseBattleMode(value: unknown) {
  const parsed = BattleModeSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
