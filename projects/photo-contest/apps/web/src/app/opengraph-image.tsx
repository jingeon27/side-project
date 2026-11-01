import { ImageResponse } from 'next/og';

export const alt = '피식. 혼자 보기 아까운 순간. 우리끼리 모으면 더 피식.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        flexDirection: 'column',
        padding: '80px 100px',
        background: '#ff9b42',
        color: '#101010',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <svg width="96" height="96" viewBox="0 0 64 64" fill="none">
          <g stroke="#101010" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m16 25 5-3 5 3M38 25l5-3 5 3" />
            <path d="M20 37c7 10 20 10 27-2" />
          </g>
        </svg>
        <div style={{ display: 'flex', fontSize: 80, fontWeight: 900 }}>피식</div>
      </div>
      <div style={{ display: 'flex', fontSize: 58, fontWeight: 700, marginTop: 48, letterSpacing: -3 }}>
        혼자 보기 아까운 순간.
      </div>
      <div style={{ display: 'flex', fontSize: 28, marginTop: 20 }}>우리끼리 모으면 더 피식.</div>
    </div>,
    size,
  );
}
