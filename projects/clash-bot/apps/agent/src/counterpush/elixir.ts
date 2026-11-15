import type { Profile } from '../config.ts';
import type { Observation } from '../vision.ts';

// Read only the established, unobstructed section of the bar. The left edge is
// covered by the number bubble; including it makes the gap detector read zero.
export function counterpushElixir(
  observation: Pick<Observation, 'elixir' | 'elixirAmount'>,
  profile: Profile,
) {
  const raw = observation.elixirAmount ?? observation.elixir;
  const amount =
    raw >= 9.98
      ? 10
      : Math.max(0, Math.min(10, ((profile.elixir.x - 99 + (raw / 10) * profile.elixir.width) / 256) * 10));
  return {
    amount,
    value: Math.min(10, Math.floor(amount + 0.03)),
    // Counterpush animates/quantizes its fill. A narrow decimal interval would
    // imply precision these screenshots do not establish.
    range: {
      min: Math.max(0, Math.floor(amount + 0.03) - 0.1),
      max: Math.min(10, Math.floor(amount + 0.03) + 1.1),
    },
  };
}

export function plausibleSpend(spent: number, cost: number, elapsedMs: number) {
  const maxGain = (Math.max(0, elapsedMs) / 1000) * (3 / 2.8);
  return spent <= cost + 1 && spent >= cost - maxGain - 1;
}
