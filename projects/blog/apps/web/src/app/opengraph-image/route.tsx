import { ImageResponse } from 'next/og';

import { labels } from '@/shared/config/labels';
import { BrandMark } from '@/shared/ui/brand-mark';

const size = { width: 1200, height: 630 };
export const dynamic = 'force-static';

export function GET() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#21354d',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        padding: '74px',
        justifyContent: 'center',
      }}
    >
      <BrandMark size={130} inverse />
      <div style={{ fontSize: 84, fontWeight: 700 }}>{labels('en').home.title}</div>
    </div>,
    size,
  );
}
