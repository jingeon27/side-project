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
        background: '#12151c',
        color: '#ffffff',
        padding: 80,
      }}
    >
      <svg width="130" height="130" viewBox="0 0 64 64">
        <path
          d="M18 12H34C43 12 48 16.2 48 23.5C48 27.5 46 30.7 42.2 32.4C46.7 33.9 49.5 37.2 49.5 41.9C49.5 49.6 43.5 54 34 54H18Z M34 18L36.4 22.6L41 25L36.4 27.4L34 32L31.6 27.4L27 25L31.6 22.6Z M28 37V45H33.5C38 45 40.2 43.7 40.2 41S38 37 33.5 37Z"
          transform="translate(-1 0)"
          fill="#f7f5ef"
          fillRule="evenodd"
        />
      </svg>
      <div style={{ display: 'flex', color: '#a5b4fc', fontSize: 30, marginBottom: 32 }}>BAMBYUL</div>
      <div style={{ display: 'flex', fontSize: 92, fontWeight: 700 }}>Game Mate</div>
      <div style={{ display: 'flex', fontSize: 32, marginTop: 32 }}>Clash Royale community</div>
    </div>,
    { width: 1200, height: 630 },
  );
}
