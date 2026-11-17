import { z } from 'zod';

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
  goblin_drill: { cost: 4, role: 'tank', name: '고블린 드릴' },
  goblin_barrel: { cost: 3, role: 'spell', name: '고블린 통' },
  firecracker: { cost: 3, role: 'support', name: '로켓병' },
} as const;
export type CardId = keyof typeof CARD_INFO;
export const cardIdSchema = z.enum(Object.keys(CARD_INFO) as [CardId, ...CardId[]]);
