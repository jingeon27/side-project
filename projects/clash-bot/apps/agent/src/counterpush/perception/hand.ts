import sharp from 'sharp';

import { type CardId, type Profile, type Rect } from '../../shared/config.ts';
import { loadHandReferences } from './hand-references.ts';

// libvips 작업 풀과 이미지 캐시를 작게 유지한다. GPU·OCR·추론 서버를 쓰지 않는다.
sharp.concurrency(1);
sharp.cache({ memory: 8, files: 0, items: 12 });

export type Template = { card: CardId; fingerprint: number[] };

export async function fingerprint(bytes: Buffer): Promise<number[]> {
  return [...(await sharp(bytes).resize(12, 12, { fit: 'fill' }).removeAlpha().greyscale().raw().toBuffer())];
}

export function difference(first: readonly number[], second: readonly number[]): number {
  if (first.length !== second.length || first.length === 0) return Infinity;
  return first.reduce((sum, value, index) => sum + Math.abs(value - second[index]!), 0) / first.length;
}

export async function crop(bytes: Buffer, rect: Rect): Promise<Buffer> {
  return sharp(bytes)
    .extract({ left: rect.x, top: rect.y, width: rect.width, height: rect.height })
    .png()
    .toBuffer();
}

export function matchCard(
  sample: number[],
  templates: Template[],
  maximum: number,
  margin: number,
): { card: CardId | null; distance: number; margin: number } {
  const mean = (values: number[]) => values.reduce((sum, item) => sum + item, 0) / values.length;
  const level = mean(sample);
  if (!sample.length || sample.reduce((sum, value) => sum + Math.abs(value - level), 0) / sample.length < 6)
    return { card: null, distance: 255, margin: 0 };
  const matches = templates.map((template) => {
    const offset = Math.max(-45, Math.min(45, mean(sample) - mean(template.fingerprint)));
    const distance = difference(
      sample,
      template.fingerprint.map((value) => value + offset),
    );
    return { card: template.card, distance };
  });
  // Normal and evolved artwork can belong to the same card. Compare distinct cards,
  // rather than treating two matching variants as an ambiguous hand slot.
  const ranked = [...new Set(matches.map((match) => match.card))]
    .map((card) => ({
      card,
      distance: Math.min(...matches.filter((match) => match.card === card).map((match) => match.distance)),
    }))
    .sort((a, b) => a.distance - b.distance);
  const best = ranked[0];
  const gap = (ranked[1]?.distance ?? Infinity) - (best?.distance ?? Infinity);
  return {
    card: best && best.distance <= maximum && gap >= margin ? best.card : null,
    distance: best?.distance ?? 255,
    margin: Number.isFinite(gap) ? gap : 0,
  };
}

// 손패는 저장소에서 검토한 그림만 쓴다. 참조가 없는 카드가 손패에 오면 다른 카드로 읽힐 수 있어 시작하지 않는다.
export async function loadHandCards(profile: Profile): Promise<Template[]> {
  const references = (await loadHandReferences()).references.filter((reference) =>
    profile.deck.includes(reference.card),
  );
  const cards = await Promise.all(
    references.map(async (reference) => ({
      card: reference.card,
      fingerprint: await fingerprint(reference.bytes),
    })),
  );
  const missing = profile.deck.filter((card) => !cards.some((template) => template.card === card));
  if (missing.length > 0) throw new Error(`저장소 손패 참조가 없는 카드가 있습니다: ${missing.join(', ')}`);
  return cards;
}

// 368×652로 맞춘 화면에서 손패 네 칸을 읽는다. 같은 카드가 두 칸에서 읽히면 둘 다 모름(null)으로 둔다.
export async function readHand(
  image: Buffer,
  profile: Profile,
  cards: Template[],
): Promise<Array<CardId | null>> {
  const read = await Promise.all(
    profile.hand.map(
      async (rect) =>
        matchCard(
          await fingerprint(await crop(image, rect)),
          cards,
          profile.thresholds.cardDistance,
          profile.thresholds.cardMargin,
        ).card,
    ),
  );
  return read.map((card) => (card && read.filter((other) => other === card).length > 1 ? null : card));
}
