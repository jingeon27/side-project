import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

export const PROJECT_DIR = fileURLToPath(new URL('../../../', import.meta.url));
export const DATA_DIR = fileURLToPath(new URL('../../../.data/', import.meta.url));
export const WIDTH = 368;
export const HEIGHT = 652;

export const CARD_INFO = {
  knight: { cost: 3, role: 'defender', name: '기사' },
  archers: { cost: 3, role: 'support', name: '아처' },
  giant: { cost: 5, role: 'tank', name: '자이언트' },
  musketeer: { cost: 4, role: 'support', name: '머스킷병' },
  minipekka: { cost: 4, role: 'defender', name: '미니 P.E.K.K.A' },
  furnace: { cost: 4, role: 'support', name: '용광로' },
  skeletons: { cost: 1, role: 'cycle', name: '해골 병사' },
  fireball: { cost: 4, role: 'spell', name: '파이어 볼' },
  arrows: { cost: 3, role: 'spell', name: '화살' },
  goblins: { cost: 2, role: 'cycle', name: '고블린' },
  valkyrie: { cost: 4, role: 'defender', name: '발키리' },
  hog_rider: { cost: 4, role: 'tank', name: '호그 라이더' },
  bomber: { cost: 2, role: 'support', name: '폭탄병' },
  ice_wizard: { cost: 3, role: 'support', name: '얼음 마법사' },
  graveyard: { cost: 5, role: 'spell', name: '무덤' },
  poison: { cost: 4, role: 'spell', name: '독' },
  goblin_hut: { cost: 4, role: 'defender', name: '고블린 오두막' },
  barbarian_barrel: { cost: 2, role: 'spell', name: '바바리안 통' },
} as const;
export type CardId = keyof typeof CARD_INFO;
export const cardIdSchema = z.enum(Object.keys(CARD_INFO) as [CardId, ...CardId[]]);
const rectSchema = z.object({
  x: z.int().nonnegative(),
  y: z.int().nonnegative(),
  width: z.int().positive(),
  height: z.int().positive(),
});
export type Rect = z.infer<typeof rectSchema>;
export type Point = { x: number; y: number };

const referenceRect = rectSchema.refine(
  (rect) => rect.x + rect.width <= WIDTH && rect.y + rect.height <= HEIGHT,
  '분석 영역이 368×652 화면을 벗어났습니다.',
);
export const profileSchema = z
  .object({
    version: z.literal(1),
    viewport: rectSchema.nullable(),
    deck: z
      .array(cardIdSchema)
      .length(8)
      .refine((deck) => new Set(deck).size === 8, '덱에는 서로 다른 카드 8장이 필요합니다.'),
    hand: z.array(referenceRect).length(4),
    elixir: referenceRect,
    marker: referenceRect,
    arena: referenceRect,
    riverY: z.number().min(100).max(500),
    thresholds: z.object({
      cardDistance: z.number().min(1).max(100),
      cardMargin: z.number().min(0).max(50),
      markerDistance: z.number().min(1).max(60),
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
  viewport: null,
  deck: ['knight', 'archers', 'giant', 'musketeer', 'minipekka', 'skeletons', 'fireball', 'arrows'],
  hand: [84, 153, 222, 291].map((x) => ({ x, y: 543, width: 61, height: 73 })),
  elixir: { x: 100, y: 628, width: 250, height: 15 },
  marker: { x: 76, y: 639, width: 7, height: 10 },
  arena: { x: 15, y: 80, width: 338, height: 425 },
  riverY: 294,
  thresholds: { cardDistance: 29, cardMargin: 3, markerDistance: 27 },
};

export async function loadProfile(path: string): Promise<Profile> {
  try {
    return profileSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new Error('초기 설정이 없습니다. 먼저 yarn workspace @side/clash-bot setup을 실행하세요.');
    throw error;
  }
}

export function center(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}
