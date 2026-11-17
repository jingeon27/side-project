import sharp from 'sharp';

import type { Profile } from '../../core/profile.ts';

export type BarReading = { elixir: number; elixirAmount: number; elixirConfidence: number };

// 보정한 막대 영역에서 보라색(가득 찬 막대의 흰 반짝임 포함)이 이어지는 길이를 읽는다.
export async function counterpushBarReading(image: Buffer, profile: Profile): Promise<BarReading> {
  const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rect = profile.elixir;
  const filledAt = (x: number, y: number) => {
    const offset = (y * info.width + x) * info.channels;
    const [r, g, b] = [data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0];
    const purple = r > 100 && b > 90 && r > g * 1.35 && b > g * 1.2;
    const white = r > 150 && b > 150 && r >= g * 0.95 && b >= g * 0.95;
    return purple || white;
  };
  const columns = Array.from({ length: rect.width }, (_, offset) => {
    const colored = Array.from({ length: rect.height - 4 }, (_, row) =>
      filledAt(rect.x + offset, rect.y + row + 2),
    ).filter(Boolean).length;
    return colored >= (rect.height - 4) * 0.4;
  });
  const firstGap = columns.findIndex(
    (filled, index) => !filled && columns.slice(index, index + 7).filter(Boolean).length < 2,
  );
  const length = firstGap < 0 ? rect.width : firstGap;
  const coverage = columns.filter((filled, index) => filled === index < length).length / columns.length;
  return {
    elixir: Math.max(0, Math.min(10, Math.floor((length / rect.width) * 10 + 0.03))),
    elixirAmount: Math.max(0, Math.min(10, (length / rect.width) * 10)),
    elixirConfidence: coverage,
  };
}

// Read only the established, unobstructed section of the bar. The left edge is
// covered by the number bubble; including it makes the gap detector read zero.
export function counterpushElixir(reading: Pick<BarReading, 'elixirAmount'>, profile: Profile) {
  const raw = reading.elixirAmount;
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
