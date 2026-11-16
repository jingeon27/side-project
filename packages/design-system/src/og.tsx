import { ImageResponse } from 'next/og';

export interface ISocialPreview {
  brand: string;
  variant: 'warm' | 'forest';
  logo: string;
  title: string;
  description: string;
  label: string;
  detail: string;
  image?: string | null;
}

const palettes = {
  warm: {
    background: '#fff5e8',
    foreground: '#32251e',
    muted: '#725846',
    accent: '#a94e13',
    surface: '#ffe4c3',
  },
  forest: {
    background: '#0b342d',
    foreground: '#f1f8ed',
    muted: '#bad5c7',
    accent: '#c1efcf',
    surface: '#174d40',
  },
};

export function socialPreviewText(value: string, limit: number) {
  const text = value
    .normalize('NFC')
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Cc}\p{Cf}\uFE0E\uFE0F]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const characters = Array.from(text);
  return characters.length > limit ? `${characters.slice(0, limit - 1).join('')}…` : text;
}

export async function createSocialPreview(data: ISocialPreview, font: ArrayBuffer): Promise<Response> {
  const colors = palettes[data.variant];
  const title = socialPreviewText(data.title, 36) || data.brand;
  const description = socialPreviewText(data.description, 48);
  const render = (image?: string | null) =>
    new ImageResponse(
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          background: colors.background,
          color: colors.foreground,
          fontFamily: 'Social',
          padding: 60,
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {/* OG images are rendered by Satori, outside the browser image pipeline. */}
          <img src={data.logo} width={56} height={56} alt="" />
          <span style={{ fontSize: 36 }}>{data.brand}</span>
        </div>
        <div style={{ display: 'flex', marginTop: 46, gap: 44, flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: 658 }}>
            <div style={{ display: 'flex', color: colors.accent, fontSize: 23, marginBottom: 22 }}>
              {socialPreviewText(data.label, 34)}
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: title.length > 20 ? 48 : 60,
                lineHeight: 1.27,
                letterSpacing: -1.7,
                wordBreak: title.split(' ').some((word) => word.length > 12) ? 'break-word' : 'keep-all',
                maxHeight: 192,
                overflow: 'hidden',
              }}
            >
              {title}
            </div>
            <div
              style={{
                display: 'flex',
                color: colors.muted,
                fontSize: 25,
                lineHeight: 1.55,
                marginTop: 18,
                maxHeight: 82,
                overflow: 'hidden',
              }}
            >
              {description}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              width: 354,
              height: 354,
              borderRadius: 32,
              overflow: 'hidden',
              background: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              src={image || data.logo}
              width={image ? 354 : 160}
              height={image ? 354 : 160}
              alt=""
              style={{ objectFit: image ? 'cover' : 'contain' }}
            />
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 'auto',
            paddingTop: 20,
            borderTop: `1px solid ${colors.muted}`,
            color: colors.muted,
            fontSize: 22,
          }}
        >
          {socialPreviewText(data.detail, 68)}
        </div>
      </div>,
      { width: 1200, height: 630, fonts: [{ name: 'Social', data: font, weight: 600, style: 'normal' }] },
    ).arrayBuffer();
  const bytes = await render(data.image).catch((error: unknown) => {
    if (!data.image) throw error;
    return render();
  });
  return new Response(bytes, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } });
}

export { readSocialPreviewImage } from './og-media.server';
