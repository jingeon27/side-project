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
        background: '#21354d',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        padding: '74px',
        justifyContent: 'center',
      }}
    >
      <svg width="130" height="130" viewBox="0 0 64 64">
        <g transform="translate(0 -3)">
          <g fill="none" stroke="#f7f3eb" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 20c7-1.5 13 .4 19 4.5 6-4.1 12-6 19-4.5v26c-7-1.5-13 .4-19 4.5-6-4.1-12-6-19-4.5Z" />
            <path d="M32 24.5v26M20 29l5 1.6M20 36l5 1.6" />
          </g>
          <path d="m42 27 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" fill="#f7f3eb" />
        </g>
      </svg>
      <div style={{ fontSize: 84, fontWeight: 700 }}>{labels('en').home.title}</div>
    </div>,
    size,
  );
}
