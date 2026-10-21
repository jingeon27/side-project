import { ImageResponse } from 'next/og';

export function createShareImage() {
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        background: '#147d64',
        color: '#ffffff',
        padding: 80,
      }}
    >
      <svg width="130" height="130" viewBox="0 0 64 64">
        <g transform="translate(0 -3)">
          <path
            d="M22 21h20c5 0 8.6 3.2 10 8.2l3.5 13.5c1.4 5.4-4.7 9-8.6 5.5L40 42H24l-6.9 6.2c-3.9 3.5-10-.1-8.6-5.5L12 29.2C13.4 24.2 17 21 22 21Z"
            fill="#f4fff9"
          />
          <path d="M19 32h10M24 27v10" fill="none" stroke="#147d64" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="41" cy="29.5" r="2.5" fill="#147d64" />
          <circle cx="47" cy="35.5" r="2.5" fill="#147d64" />
        </g>
      </svg>
      <div style={{ display: 'flex', color: '#d0f2e6', fontSize: 30, marginBottom: 32 }}>BAMBYUL</div>
      <div style={{ display: 'flex', fontSize: 92, fontWeight: 700 }}>Game Mate</div>
      <div style={{ display: 'flex', fontSize: 32, marginTop: 32 }}>Clash Royale community</div>
    </div>,
    { width: 1200, height: 630 },
  );
}
