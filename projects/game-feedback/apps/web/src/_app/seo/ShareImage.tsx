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
        <path
          d="M18 13h28a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H31L20 52v-9h-2a6 6 0 0 1-6-6V19a6 6 0 0 1 6-6Z"
          fill="#f4fff9"
        />
        <path
          d="M41 23H27v12h14v-6h-6"
          fill="none"
          stroke="#147d64"
          strokeWidth="4"
          strokeLinejoin="round"
          strokeLinecap="square"
        />
      </svg>
      <div style={{ display: 'flex', color: '#d0f2e6', fontSize: 30, marginBottom: 32 }}>BAMBYUL</div>
      <div style={{ display: 'flex', fontSize: 92, fontWeight: 700 }}>Game Mate</div>
      <div style={{ display: 'flex', fontSize: 32, marginTop: 32 }}>Clash Royale community</div>
    </div>,
    { width: 1200, height: 630 },
  );
}
