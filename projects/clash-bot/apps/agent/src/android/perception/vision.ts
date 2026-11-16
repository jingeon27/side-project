import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import sharp from 'sharp';

import {
  center,
  HEIGHT,
  WIDTH,
  type CardId,
  type Point,
  type Profile,
  type Rect,
} from '../../shared/config.ts';
import { loadHandReferences } from '../../shared/hand-references.ts';

// Keep libvips' worker pool and image cache bounded. No GPU, OCR or inference server.
sharp.concurrency(1);
sharp.cache({ memory: 8, files: 0, items: 12 });
export type HandCard = {
  slot: number;
  card: CardId | null;
  distance: number;
  margin: number;
  ready: boolean;
  point: Point;
};
export type Marker = Point & { width: number };
export type Observation = {
  capturedAt: number;
  frameHash: string;
  viewport: Rect;
  inBattle: boolean;
  markerDistance: number;
  elixir: number;
  elixirAmount?: number;
  elixirConfidence: number;
  hand: HandCard[];
  enemies: Marker[];
  allies: Marker[];
};
export type Template = { card: CardId; fingerprint: number[] };
export type Templates = { cards: Template[]; marker: number[] };
type Pixels = { data: Buffer; width: number; height: number; channels: number };

export async function fingerprint(bytes: Buffer): Promise<number[]> {
  return [...(await sharp(bytes).resize(12, 12, { fit: 'fill' }).removeAlpha().greyscale().raw().toBuffer())];
}

export function difference(first: readonly number[], second: readonly number[]): number {
  if (first.length !== second.length || first.length === 0) return Infinity;
  return first.reduce((sum, value, index) => sum + Math.abs(value - second[index]!), 0) / first.length;
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

async function ifPresent<T>(read: Promise<T>): Promise<T | null> {
  try {
    return await read;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

const toTemplates = (images: Array<{ card: CardId; bytes: Buffer }>): Promise<Template[]> =>
  Promise.all(
    images.map(async (image) => ({ card: image.card, fingerprint: await fingerprint(image.bytes) })),
  );

// 참조가 없는 카드가 손패에 오면 다른 카드로 읽힐 수 있으므로 시작하지 않는다.
const missingCards = (profile: Profile, cards: Template[]) =>
  profile.deck.filter((card) => !cards.some((template) => template.card === card));

const repositoryHandImages = async (profile: Profile) =>
  (await loadHandReferences()).references.filter((reference) => profile.deck.includes(reference.card));

async function loadBattleMarker(dataDir: string): Promise<number[]> {
  const image =
    (await ifPresent(readFile(join(dataDir, 'templates/battle.png')))) ??
    (await ifPresent(readFile(join(dataDir, 'assets/screen/in_game.jpg'))));
  if (!image) throw new Error('대전 표시 참조 이미지가 없습니다. setup을 먼저 실행하세요.');
  return fingerprint(image);
}

// Counterpush는 고정된 웹 게임 하나이므로 손패는 저장소에서 검토한 그림만 쓴다.
export async function loadCounterpushCards(profile: Profile): Promise<Template[]> {
  const cards = await toTemplates(await repositoryHandImages(profile));
  const missing = missingCards(profile, cards);
  if (missing.length > 0) throw new Error(`저장소 손패 참조가 없는 카드가 있습니다: ${missing.join(', ')}`);
  return cards;
}

export async function loadCounterpushTemplates(dataDir: string, profile: Profile): Promise<Templates> {
  return { cards: await loadCounterpushCards(profile), marker: await loadBattleMarker(dataDir) };
}

// Android·BlueStacks는 저장소 그림에 이 기기에서 learn으로 등록한 그림과 내려받은 기본 그림을 더한다.
// 이전 setup이 .data/templates에 복사한 저장소 그림은 바이트가 같으므로 건너뛰고 저장소의 카드 이름을 따른다.
export async function loadTemplates(dataDir: string, profile: Profile): Promise<Templates> {
  const repository = await repositoryHandImages(profile);
  const repositoryHashes = new Set(repository.map((reference) => reference.sha256));
  const device = await Promise.all(
    profile.deck.map(async (card) => {
      const primary = await ifPresent(readFile(join(dataDir, 'templates', `${card}.png`)));
      const directory = join(dataDir, 'templates/variants', card);
      const files = ((await ifPresent(readdir(directory))) ?? [])
        .filter((file) => file.endsWith('.png'))
        .toSorted();
      const variants = await Promise.all(files.map((file) => readFile(join(directory, file))));
      // 내려받은 기본 그림은 이 기기의 대표 그림을 등록하기 전까지만 쓴다.
      const fallback = primary
        ? null
        : await ifPresent(readFile(join(dataDir, 'assets/cards', `${card}.jpg`)));
      return [primary, ...variants, fallback].flatMap((bytes) =>
        bytes && !repositoryHashes.has(createHash('sha256').update(bytes).digest('hex'))
          ? [{ card, bytes }]
          : [],
      );
    }),
  );
  const cards = await toTemplates([...repository, ...device.flat()]);
  const missing = missingCards(profile, cards);
  if (missing.length > 0)
    throw new Error(
      `손패 참조 이미지가 없는 카드가 있습니다: ${missing.join(', ')}. setup을 실행하거나 learn으로 이 기기의 그림을 등록하세요.`,
    );
  return { cards, marker: await loadBattleMarker(dataDir) };
}

export async function normalize(bytes: Buffer, profile: Profile): Promise<{ image: Buffer; viewport: Rect }> {
  const meta = await sharp(bytes, { limitInputPixels: 16_000_000 }).metadata();
  if (!meta.width || !meta.height) throw new Error('화면 크기를 확인하지 못했습니다.');
  const viewport = profile.viewport ?? { x: 0, y: 0, width: meta.width, height: meta.height };
  if (viewport.x + viewport.width > meta.width || viewport.y + viewport.height > meta.height)
    throw new Error('게임 화면 영역이 캡처 크기를 벗어났습니다.');
  if (Math.abs(viewport.width / viewport.height - WIDTH / HEIGHT) > 0.025)
    throw new Error(
      '게임 화면이 9:16 비율이 아닙니다. 에뮬레이터를 720×1280으로 설정하거나 calibrate --viewport로 게임 영역을 지정하세요.',
    );
  const image = await sharp(bytes)
    .extract({ left: viewport.x, top: viewport.y, width: viewport.width, height: viewport.height })
    .resize(WIDTH, HEIGHT, { fit: 'fill' })
    .removeAlpha()
    .png()
    .toBuffer();
  return { image, viewport };
}

export async function crop(bytes: Buffer, rect: Rect): Promise<Buffer> {
  return sharp(bytes)
    .extract({ left: rect.x, top: rect.y, width: rect.width, height: rect.height })
    .png()
    .toBuffer();
}

function colorAt(pixels: Pixels, x: number, y: number): [number, number, number] {
  const offset = (y * pixels.width + x) * pixels.channels;
  return [pixels.data[offset] ?? 0, pixels.data[offset + 1] ?? 0, pixels.data[offset + 2] ?? 0];
}

export function readElixir(
  pixels: Pixels,
  rect: Rect,
  allowWhiteFill = false,
): { value: number; amount: number; confidence: number } {
  const columns = Array.from({ length: rect.width }, (_, offset) => {
    const colored = Array.from({ length: rect.height - 4 }, (_, row) => {
      const [r, g, b] = colorAt(pixels, rect.x + offset, rect.y + row + 2);
      const purple = r > 100 && b > 90 && r > g * 1.35 && b > g * 1.2;
      // Counterpush's full bar has a traveling white highlight. This option is
      // used only on its narrow, calibrated bar ROI, never general field pixels.
      const white = allowWhiteFill && r > 150 && b > 150 && r >= g * 0.95 && b >= g * 0.95;
      return purple || white;
    }).filter(Boolean).length;
    return colored >= (rect.height - 4) * 0.4;
  });
  const firstGap = columns.findIndex(
    (filled, index) => !filled && columns.slice(index, index + 7).filter(Boolean).length < 2,
  );
  const length = firstGap < 0 ? rect.width : firstGap;
  const coverage = columns.filter((filled, index) => filled === index < length).length / columns.length;
  return {
    value: Math.max(0, Math.min(10, Math.floor((length / rect.width) * 10 + 0.03))),
    amount: Math.max(0, Math.min(10, (length / rect.width) * 10)),
    confidence: coverage,
  };
}

export function healthMarkers(pixels: Pixels, profile: Profile, side: 'enemy' | 'ally'): Marker[] {
  const { arena } = profile;
  const minY = Math.max(arena.y, Math.floor(profile.riverY - 30));
  const maxY = Math.min(arena.y + arena.height, pixels.height);
  const spans: { x: number; y: number; width: number }[] = [];
  for (const y of Array.from({ length: maxY - minY }, (_, index) => minY + index)) {
    const row = Array.from({ length: arena.width }, (_, offset) => {
      const [r, g, b] = colorAt(pixels, arena.x + offset, y);
      return side === 'enemy'
        ? r > 220 && g > 30 && g < 120 && b > 65 && b > g * 1.3 && r > b * 1.3
        : b > 155 && g > 105 && r < 145 && b > r * 1.4;
    });
    const starts = row.flatMap((filled, x) => (filled && !row[x - 1] ? [x] : []));
    starts.forEach((start) => {
      const end = row.findIndex((filled, x) => x > start && !filled);
      const width = (end < 0 ? row.length : end) - start;
      if (width >= 5 && width <= 30) spans.push({ x: arena.x + start, y, width });
    });
  }
  const groups: Marker[] = [];
  spans.forEach((span) => {
    // A colored health bar spans several scanlines; merge those into one marker.
    if (
      groups.some(
        (group) => Math.abs(group.x - (span.x + span.width / 2)) < 7 && Math.abs(group.y - span.y) < 8,
      )
    )
      return;
    groups.push({ x: span.x + span.width / 2, y: span.y, width: span.width });
  });
  return groups;
}

export async function annotatedScreen(
  bytes: Buffer,
  profile: Profile,
  observation: Observation,
): Promise<Buffer> {
  const { image } = await normalize(bytes, profile);
  const rectangle = (rect: Rect, color: string, label: string) =>
    `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="none" stroke="${color}"/><text x="${rect.x}" y="${rect.y - 3}" fill="${color}" font-size="9">${label}</text>`;
  const boxes = profile.hand.map((rect, index) =>
    rectangle(
      rect,
      observation.hand[index]?.card ? '#9bff8a' : '#ffbf69',
      `${index + 1}: ${observation.hand[index]?.card ?? 'unknown'}`,
    ),
  );
  const overlay = `<svg width="368" height="652">${boxes.join('')}${rectangle(profile.marker, '#78d9ff', 'battle')}${rectangle(profile.elixir, '#efadff', `elixir: ${observation.elixir}`)}<path d="M15 ${profile.riverY}H353" stroke="#fff" stroke-dasharray="4 4"/>${observation.enemies.map((marker) => `<circle cx="${marker.x}" cy="${marker.y}" r="6" stroke="#ff5c6c" fill="none"/>`).join('')}</svg>`;
  return sharp(image)
    .composite([{ input: Buffer.from(overlay) }])
    .png()
    .toBuffer();
}

export async function analyze(
  bytes: Buffer,
  profile: Profile,
  templates: Templates,
  capturedAt: number,
  options: { fieldMarkers?: boolean } = {},
): Promise<Observation> {
  const { image, viewport } = await normalize(bytes, profile);
  const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
  const pixels: Pixels = { data, width: info.width, height: info.height, channels: info.channels };
  const markerDistance = difference(await fingerprint(await crop(image, profile.marker)), templates.marker);
  const rawHand = await Promise.all(
    profile.hand.map(async (rect, slot) => {
      const cardImage = await crop(image, rect);
      const match = matchCard(
        await fingerprint(cardImage),
        templates.cards,
        profile.thresholds.cardDistance,
        profile.thresholds.cardMargin,
      );
      const { channels } = await sharp(cardImage).stats();
      const colorSpread =
        Math.max(...channels.map((channel) => channel.mean)) -
        Math.min(...channels.map((channel) => channel.mean));
      return { slot, ...match, ready: colorSpread > 7, point: center(rect) };
    }),
  );
  const hand = rawHand.map((item) =>
    rawHand.filter((other) => other.card && other.card === item.card).length > 1
      ? { ...item, card: null, ready: false }
      : item,
  );
  const elixir = readElixir(pixels, profile.elixir);
  const recognized = hand.filter((item) => item.card).length;
  return {
    capturedAt,
    frameHash: createHash('sha256').update(image).digest('hex'),
    viewport,
    inBattle:
      markerDistance < profile.thresholds.markerDistance && recognized >= 2 && elixir.confidence >= 0.85,
    markerDistance,
    elixir: elixir.value,
    elixirAmount: elixir.amount,
    elixirConfidence: elixir.confidence,
    hand,
    enemies: options.fieldMarkers === false ? [] : healthMarkers(pixels, profile, 'enemy'),
    allies: options.fieldMarkers === false ? [] : healthMarkers(pixels, profile, 'ally'),
  };
}
