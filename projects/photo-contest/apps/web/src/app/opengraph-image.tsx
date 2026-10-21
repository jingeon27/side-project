import { ImageResponse } from 'next/og';

export const alt = '별사대 — 사진·동영상·합성을 나누는 그룹';
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
        background: '#111827',
        color: '#ffffff',
        fontFamily: 'sans-serif',
      }}
    >
      <svg width="130" height="130" viewBox="0 0 64 64">
        <path d="m39 10 3.7 11.3L54 25l-11.3 3.7L39 40l-3.7-11.3L24 25l11.3-3.7Z" fill="#f5dc93" />
        <path d="m20 34 2.5 7.5L30 44l-7.5 2.5L20 54l-2.5-7.5L10 44l7.5-2.5Z" fill="#e8edf7" />
        <circle cx="18" cy="18" r="2" fill="#e8edf7" />
      </svg>
      <div style={{ display: 'flex', fontSize: 72, fontWeight: 700, marginTop: 30 }}>별사대</div>
      <div style={{ display: 'flex', fontSize: 26, marginTop: 22, color: '#e8edf7', letterSpacing: 7 }}>
        PHOTO · VIDEO · REMIX
      </div>
    </div>,
    size,
  );
}
