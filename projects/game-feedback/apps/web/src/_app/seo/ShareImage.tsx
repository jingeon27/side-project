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
        background: '#111827',
        color: '#ffffff',
        padding: 80,
      }}
    >
      <svg width="130" height="130" viewBox="0 0 64 64">
        <path d="m39 10 3.7 11.3L54 25l-11.3 3.7L39 40l-3.7-11.3L24 25l11.3-3.7Z" fill="#f5dc93" />
        <path d="m20 34 2.5 7.5L30 44l-7.5 2.5L20 54l-2.5-7.5L10 44l7.5-2.5Z" fill="#e8edf7" />
        <circle cx="18" cy="18" r="2" fill="#e8edf7" />
      </svg>
      <div style={{ display: 'flex', color: '#f5dc93', fontSize: 30, marginBottom: 32 }}>BAMBYUL</div>
      <div style={{ display: 'flex', fontSize: 92, fontWeight: 700 }}>Game Mate</div>
      <div style={{ display: 'flex', fontSize: 32, marginTop: 32 }}>Clash Royale community</div>
    </div>,
    { width: 1200, height: 630 },
  );
}
