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
        background: '#12151c',
        color: '#ffffff',
        fontFamily: 'sans-serif',
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
      <div style={{ display: 'flex', fontSize: 72, fontWeight: 700, marginTop: 30 }}>별사대</div>
      <div style={{ display: 'flex', fontSize: 26, marginTop: 22, color: '#e8edf7', letterSpacing: 7 }}>
        PHOTO · VIDEO · REMIX
      </div>
    </div>,
    size,
  );
}
