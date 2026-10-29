import { ImageResponse } from 'next/og';

export const alt = '별사대 - 웃긴 순간을 함께 나누는 그룹';
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
        background: '#e85d4a',
        color: '#ffffff',
        fontFamily: 'sans-serif',
      }}
    >
      <svg width="130" height="130" viewBox="0 0 64 64">
        <path
          d="m25 22 3.5-6h9l3.5 6H47a5 5 0 0 1 5 5v17a5 5 0 0 1-5 5H17a5 5 0 0 1-5-5V27a5 5 0 0 1 5-5Z"
          fill="none"
          stroke="#fff9f2"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="m32 26 3 6 6 3-6 3-3 6-3-6-6-3 6-3Z" fill="#fff9f2" />
        <circle cx="45" cy="28" r="1.8" fill="#fff9f2" />
      </svg>
      <div style={{ display: 'flex', fontSize: 72, fontWeight: 700, marginTop: 30 }}>별사대</div>
      <div style={{ display: 'flex', fontSize: 26, marginTop: 22, color: '#fff0e9', letterSpacing: 7 }}>
        웃긴 순간을 함께 나눠요
      </div>
    </div>,
    size,
  );
}
