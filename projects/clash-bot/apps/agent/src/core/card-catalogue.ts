import { readFileSync } from 'node:fs';

import { z } from 'zod';

const PLACEMENTS = [
  'troop',
  'ranged_troop',
  'building',
  'area_spell',
  'spawn_spell',
  'rolling_spell',
  'tower_spell',
  'anywhere',
  'unsupported',
] as const;
const vector = z.array(z.number().min(0).max(1));

// 엔진이 시뮬레이션할 수 있는 모든 카드와 필드 오브젝트의 정규화한 특징이다.
// Python(clash_bot.arena.catalogue)도 같은 파일을 읽고, arena catalogue가 고정 엔진 수치표로 만든다.
export const CARD_CATALOGUE = z
  .strictObject({
    format: z.literal('clash-card-catalogue-v1'),
    id: z.string().regex(/^[a-f0-9]{64}$/),
    tableVersion: z.string(),
    tableFNV: z.string(),
    cardFeatures: z.array(z.string()).min(1),
    bodyFeatures: z.array(z.string()).min(1),
    cards: z.record(
      z.string(),
      z.strictObject({
        engine: z.string(),
        elixir: z.int().min(0).max(10),
        placement: z.enum(PLACEMENTS),
        features: vector,
      }),
    ),
    bodies: z.record(z.string(), vector),
    units: z.record(z.string(), z.string()),
  })
  .refine(
    (catalogue) =>
      Object.values(catalogue.cards).every(
        (card) => card.features.length === catalogue.cardFeatures.length,
      ) &&
      Object.values(catalogue.bodies).every((body) => body.length === catalogue.bodyFeatures.length) &&
      '?' in catalogue.bodies,
    '카드·필드 오브젝트의 특징 수가 이름 목록과 다르거나 모르는 오브젝트(?)가 없습니다.',
  )
  .parse(JSON.parse(readFileSync(new URL('../../contracts/card-catalogue.json', import.meta.url), 'utf8')));

export type CatalogueCard = (typeof CARD_CATALOGUE)['cards'][string];
// 객체의 상속 속성("constructor" 같은 이름)을 카드로 읽지 않도록 Map으로 찾는다.
const cards = new Map(Object.entries(CARD_CATALOGUE.cards));
const bodies = new Map(Object.entries(CARD_CATALOGUE.bodies));
export const CARD_SIZE = CARD_CATALOGUE.cardFeatures.length;
export const BODY_SIZE = CARD_CATALOGUE.bodyFeatures.length;

export const catalogueCard = (name: string | null): CatalogueCard | undefined =>
  name === null ? undefined : cards.get(name);
export const isCatalogueBody = (name: string) => bodies.has(name);
export const bodyVector = (name: string): number[] => bodies.get(name) ?? bodies.get('?')!;
