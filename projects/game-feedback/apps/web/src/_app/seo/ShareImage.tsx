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
        background: '#101010',
        color: '#ffffff',
        padding: 80,
      }}
    >
      <div style={{ display: 'flex', color: '#ff7a2b', fontSize: 30, marginBottom: 32 }}>
        PLAY BETTER, TOGETHER
      </div>
      <div style={{ display: 'flex', fontSize: 92, fontWeight: 700 }}>Game Feedback</div>
      <div style={{ display: 'flex', fontSize: 32, marginTop: 32 }}>Clash Royale community</div>
    </div>,
    { width: 1200, height: 630 },
  );
}
