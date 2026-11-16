import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { cardIdSchema } from './cards.ts';
import { HEIGHT, rectSchema, WIDTH } from './geometry.ts';

const referenceRect = rectSchema.refine(
  (rect) => rect.x + rect.width <= WIDTH && rect.y + rect.height <= HEIGHT,
  '분석 영역이 368×652 화면을 벗어났습니다.',
);
export const profileSchema = z
  .object({
    version: z.literal(1),
    deck: z
      .array(cardIdSchema)
      .length(8)
      .refine((deck) => new Set(deck).size === 8, '덱에는 서로 다른 카드 8장이 필요합니다.'),
    hand: z.array(referenceRect).length(4),
    elixir: referenceRect,
    arena: referenceRect,
    riverY: z.number().min(100).max(500),
    thresholds: z.object({
      cardDistance: z.number().min(1).max(100),
      cardMargin: z.number().min(0).max(50),
    }),
  })
  .strict()
  .superRefine((profile, context) => {
    if (profile.riverY < profile.arena.y || profile.riverY >= profile.arena.y + profile.arena.height - 20)
      context.addIssue({ code: 'custom', message: '강의 위치는 아레나 내부여야 합니다.', path: ['riverY'] });
  });
export type Profile = z.infer<typeof profileSchema>;
export const DEFAULT_PROFILE: Profile = {
  version: 1,
  deck: ['knight', 'archers', 'giant', 'musketeer', 'minipekka', 'skeletons', 'fireball', 'arrows'],
  hand: [84, 153, 222, 291].map((x) => ({ x, y: 543, width: 61, height: 73 })),
  elixir: { x: 100, y: 628, width: 250, height: 15 },
  arena: { x: 15, y: 80, width: 338, height: 425 },
  riverY: 294,
  thresholds: { cardDistance: 29, cardMargin: 3 },
};

export async function loadProfile(path: string): Promise<Profile> {
  try {
    return profileSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new Error(`프로필 파일이 없습니다: ${path}`);
    throw error;
  }
}
