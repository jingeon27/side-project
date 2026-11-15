import sharp from 'sharp';

export async function readBattleResult(
  image: Buffer,
): Promise<{ outcome: 'win' | 'loss' | 'draw'; blue: number; red: number } | null> {
  const { data, info } = await sharp(image)
    .resize(368, 652, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ratio = (
    x: number,
    y: number,
    width: number,
    height: number,
    predicate: (r: number, g: number, b: number) => boolean,
  ) => {
    const matches = Array.from({ length: width * height }, (_, i) => {
      const offset = ((y + Math.floor(i / width)) * info.width + x + (i % width)) * info.channels;
      return predicate(data[offset]!, data[offset + 1]!, data[offset + 2]!);
    }).filter(Boolean).length;
    return matches / (width * height);
  };
  const blueButton = ratio(200, 575, 80, 35, (r, g, b) => r < 100 && g > 110 && b > 170) > 0.5;
  const redBanner = ratio(50, 180, 260, 30, (r, g, b) => r > 80 && r > g * 1.8 && b > 25) > 0.4;
  if (!blueButton || !redBanner) return null;
  const gold = (r: number, g: number, b: number) => r > 170 && g > 110 && b < 130 && r > b * 1.4;
  const crowns = (y: number) => [65, 164, 263].filter((x) => ratio(x, y, 45, 40, gold) > 0.12).length;
  const red = crowns(105),
    blue = crowns(328);
  if (red + blue === 0) return null;
  return { outcome: blue > red ? 'win' : blue < red ? 'loss' : 'draw', blue, red };
}
