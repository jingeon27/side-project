import sharp from 'sharp';

import { DEFAULT_PROFILE, HEIGHT, WIDTH, type CardId } from '../../shared/config.ts';
import { fingerprint, type Templates } from '../perception/vision.ts';

export async function fixture(
  options: { elixir?: number; enemies?: number; marker?: boolean; hand?: CardId[] } = {},
): Promise<{ image: Buffer; templates: Templates }> {
  const cards = await Promise.all(
    DEFAULT_PROFILE.deck.map(async (card, index) => {
      const image = await sharp(
        Buffer.from(
          `<svg width="61" height="73"><rect width="61" height="73" fill="rgb(${70 + index * 19},${125 + index * 5},${90 + index * 13})"/>${Array.from({ length: 6 }, (_, stripe) => `<rect x="${(stripe * 13 + index * 11) % 52}" y="${(stripe * 19 + index * 23) % 61}" width="${8 + index}" height="10" fill="${stripe % 2 ? '#f3ddb4' : '#25313e'}"/>`).join('')}</svg>`,
        ),
      )
        .png()
        .toBuffer();
      return { card, image, fingerprint: await fingerprint(image) };
    }),
  );
  const markerImage = await sharp(
    Buffer.from(
      '<svg width="7" height="10"><rect width="7" height="10" fill="#9453ba"/><path d="M0 0 7 10M7 0 0 10" stroke="#f6b8f8" stroke-width="2"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  const elixir = options.elixir ?? 8;
  const shapes = `<svg width="368" height="652"><rect x="100" y="628" width="250" height="15" fill="#35263b"/>${elixir > 0 ? `<rect x="100" y="628" width="${25 * elixir}" height="15" fill="#d547df"/>` : ''}${Array.from({ length: options.enemies ?? 1 }, (_, index) => `<rect x="${85 + index * 17}" y="${340 + index * 9}" width="12" height="3" fill="#ed3355"/>`).join('')}<rect x="74" y="404" width="40" height="4" fill="#70d0fc"/></svg>`;
  const image = await sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: '#293d32' } })
    .composite([
      { input: Buffer.from(shapes), left: 0, top: 0 },
      ...(options.hand ?? DEFAULT_PROFILE.deck.slice(0, 4)).map((id, index) => ({
        input: cards.find((card) => card.card === id)!.image,
        left: DEFAULT_PROFILE.hand[index]!.x,
        top: DEFAULT_PROFILE.hand[index]!.y,
      })),
      ...(options.marker === false
        ? []
        : [{ input: markerImage, left: DEFAULT_PROFILE.marker.x, top: DEFAULT_PROFILE.marker.y }]),
    ])
    .png()
    .toBuffer();
  return {
    image,
    templates: {
      cards: cards.map(({ card, fingerprint }) => ({ card: card as CardId, fingerprint })),
      marker: await fingerprint(markerImage),
    },
  };
}
