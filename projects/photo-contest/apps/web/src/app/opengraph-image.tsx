import { ImageResponse } from 'next/og';

export const alt = '웃긴순간 — 사진·동영상·합성을 나누는 그룹';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        background: '#ffffff',
        color: '#111111',
        fontFamily: 'sans-serif',
      }}
    >
      <svg width="150" height="150" viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="32" r="29" fill="#111111" />
        <circle cx="23" cy="25" r="3" fill="white" />
        <path d="M38 25h9M20 38c5 10 19 10 24 0" stroke="white" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <div style={{ display: 'flex', fontSize: 72, fontWeight: 700, marginTop: 30 }}>Laughing Moments</div>
      <div style={{ display: 'flex', fontSize: 26, marginTop: 22, color: '#666666', letterSpacing: 7 }}>
        PHOTO · VIDEO · REMIX
      </div>
    </div>,
    size,
  );
}
