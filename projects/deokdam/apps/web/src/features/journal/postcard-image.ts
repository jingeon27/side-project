const width = 1000;
const inset = 62;
const ink = '#382b25';
const fadedInk = '#776055';
const clay = '#983f2c';
const serif = '"Gowun Batang Display", "Nanum Myeongjo", AppleMyungjo, "Noto Serif CJK KR", serif';
const sans = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif';
const artCache = new Map<string, Promise<HTMLImageElement>>();

function loadArt(url: string) {
  const cached = artCache.get(url);
  if (cached) return cached;
  const image = new Image();
  image.src = url;
  const ready = image
    .decode()
    .then(() => image)
    .catch((error: unknown) => {
      artCache.delete(url);
      throw error;
    });
  artCache.set(url, ready);
  return ready;
}

function linesThatFit(context: CanvasRenderingContext2D, text: string, available: number) {
  const lines = [''];
  for (const word of text.trim().split(/\s+/)) {
    const last = lines.at(-1) ?? '';
    const joined = last ? last + ' ' + word : word;
    if (context.measureText(joined).width <= available) {
      lines[lines.length - 1] = joined;
      continue;
    }
    if (last) lines.push('');
    for (const { segment } of new Intl.Segmenter('ko').segment(word)) {
      const current = lines.at(-1) ?? '';
      if (current && context.measureText(current + segment).width > available) {
        lines.push(segment);
        continue;
      }
      lines[lines.length - 1] = current + segment;
    }
  }
  return lines;
}

export interface IPostcardContent {
  title: string;
  message: string;
  art?: string;
  journal?: boolean;
}

export async function createPostcard(content: IPostcardContent) {
  const [mark, art] = await Promise.all([
    loadArt('/images/deokdam-mark.png'),
    content.art ? loadArt(content.art) : undefined,
    document.fonts.load('700 48px "Gowun Batang Display"', content.title + content.message),
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');

  const fontSize = content.journal ? 42 : 52;
  const lineHeight = Math.ceil(fontSize * 1.55);
  const bodyFont = '700 ' + fontSize + 'px ' + serif;
  const indent = content.journal ? 35 : 0;
  const textWidth = width - inset * 2 - indent;
  context.font = bodyFont;
  const paragraphs = content.message
    .trim()
    .split(/\n+/)
    .filter((part) => part.trim());
  const groups = paragraphs.map((line) => linesThatFit(context, line, textWidth));
  const artHeight = art ? 370 : 0;
  const contentTop = artHeight + 164;
  const gap = content.journal ? 36 : 12;
  const groupHeights = groups.map((group) => group.length * lineHeight + gap);
  const footerY = contentTop + groupHeights.reduce((sum, n) => sum + n, 0) + 36;
  canvas.height = footerY + 100;

  context.fillStyle = '#fcf6e9';
  context.fillRect(0, 0, width, canvas.height);
  if (art) {
    const sourceHeight = Math.min(art.height, (art.width * artHeight) / width);
    const sourceWidth = Math.min(art.width, (art.height * width) / artHeight);
    context.drawImage(
      art,
      (art.width - sourceWidth) / 2,
      (art.height - sourceHeight) * 0.38,
      sourceWidth,
      sourceHeight,
      0,
      0,
      width,
      artHeight,
    );
  }

  context.textBaseline = 'middle';
  context.fillStyle = clay;
  context.font = '700 30px ' + sans;
  context.fillText(content.journal ? '기록장에서' : '이야기에서', inset, artHeight + 62);
  context.fillStyle = ink;
  context.font = '700 46px ' + serif;
  context.fillText(content.title, inset, artHeight + 115, width - 2 * inset);
  context.textBaseline = 'top';
  context.font = bodyFont;
  groups.reduce((y, group, index) => {
    if (content.journal) {
      context.fillStyle = clay;
      context.beginPath();
      context.arc(inset + 6, y + fontSize / 2, 5, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = ink;
    group.forEach((line, i) => context.fillText(line, inset + indent, y + i * lineHeight));
    return y + (groupHeights[index] ?? 0);
  }, contentTop);

  context.fillStyle = '#d7c6ad';
  context.fillRect(inset, footerY, width - inset * 2, 2);
  context.textBaseline = 'middle';
  context.fillStyle = fadedInk;
  context.font = '600 26px ' + sans;
  context.fillText('덕담집', inset, footerY + 48);
  context.drawImage(mark, width - inset - 52, footerY + 23, 52, 52);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('PNG unavailable'))), 'image/png');
  });
  return { blob, width, height: canvas.height };
}
