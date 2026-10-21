import { ImageResponse } from 'next/og';

import { labels } from '@/shared/config/labels';

const size = { width: 1200, height: 630 };
export const dynamic = 'force-static';

export function GET() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#ffffff',
        color: '#18181b',
        display: 'flex',
        flexDirection: 'column',
        padding: '74px',
        justifyContent: 'center',
      }}
    >
      <div style={{ fontSize: 84, fontWeight: 700 }}>{labels('en').home.title}</div>
    </div>,
    size,
  );
}
