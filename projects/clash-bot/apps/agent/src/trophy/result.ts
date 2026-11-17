import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import sharp from 'sharp';

import { trophyEpisodeSchema, type TrophyEpisode, type TrophyResult } from './protocol.ts';

// Only the normalized result panel is read. Missing panels are not draws/losses.
export async function readTrophyResult(image: Buffer): Promise<TrophyResult | null> {
  const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== 368 || info.height !== 652) throw new Error('결과 화면은 368×652여야 합니다.');
  const ratio = (
    x: number,
    y: number,
    w: number,
    h: number,
    test: (r: number, g: number, b: number) => boolean,
  ) =>
    Array.from({ length: w * h }, (_, i) => {
      const at = ((y + Math.floor(i / w)) * 368 + x + (i % w)) * info.channels;
      return test(data.readUInt8(at), data.readUInt8(at + 1), data.readUInt8(at + 2));
    }).filter(Boolean).length /
    (w * h);
  if (ratio(200, 575, 80, 35, (r, g, b) => r < 100 && g > 110 && b > 170) < 0.5) return null;
  const band = (start: number, end: number, test: (r: number, g: number, b: number) => boolean) => {
    const lines = Array.from({ length: end - start }, (_, i) => ratio(50, start + i, 260, 1, test) > 0.4);
    const groups = lines
      .flatMap((yes, i) =>
        yes && !lines[i - 1]
          ? [
              {
                y: start + i,
                length:
                  (lines.findIndex((next, j) => j > i && !next) < 0
                    ? lines.length
                    : lines.findIndex((next, j) => j > i && !next)) - i,
              },
            ]
          : [],
      )
      .toSorted((a, b) => b.length - a.length);
    return groups[0] && groups[0].length >= 12 ? groups[0].y : null;
  };
  const red = band(130, 230, (r, g, b) => r > 80 && r > g * 1.8 && b > 25);
  const blue = band(300, 430, (r, g, b) => r < 120 && g > 70 && b > 130 && b > r * 1.4);
  if (red === null || blue === null) return null;
  const crowns = (top: number) =>
    [65, 164, 263].filter(
      (x) => ratio(x, top - 80, 45, 65, (r, g, b) => r > 170 && g > 110 && b < 130 && r > b * 1.4) > 0.08,
    ).length;
  const b = crowns(blue),
    r = crowns(red);
  if (b + r === 0) return null;
  return { blue: b, red: r, outcome: b > r ? 'win' : b < r ? 'loss' : 'draw' };
}

export async function verifiedTrophyEpisode(directory: string): Promise<TrophyEpisode> {
  const episode = trophyEpisodeSchema.parse(
    JSON.parse(await readFile(join(directory, 'trajectory.json'), 'utf8')),
  );
  for (const transition of episode.transitions) {
    const bytes = await readFile(join(directory, transition.image));
    if (createHash('sha256').update(bytes).digest('hex') !== transition.imageSHA256)
      throw new Error('판단 직전 화면 증거가 바뀌었습니다.');
  }
  for (const evidence of episode.resultEvidence) {
    const bytes = await readFile(join(directory, evidence.image));
    if (createHash('sha256').update(bytes).digest('hex') !== evidence.sha256)
      throw new Error('결과 화면 증거가 바뀌었습니다.');
    const result = await readTrophyResult(bytes);
    if (JSON.stringify(result) !== JSON.stringify(episode.result))
      throw new Error('저장한 결과와 실제 결과 화면이 다릅니다.');
  }
  return episode;
}
