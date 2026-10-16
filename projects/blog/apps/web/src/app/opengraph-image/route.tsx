import { ImageResponse } from 'next/og';

const size = { width: 1200, height: 630 };
export const dynamic = 'force-static';

export function GET() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#f5f4ef',
        color: '#282724',
        display: 'flex',
        flexDirection: 'column',
        padding: '74px',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ fontSize: 24, letterSpacing: '5px' }}>JINGEON / ENGINEERING NOTES</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ fontSize: 84, fontWeight: 700 }}>Build. Learn. Write.</div>
        <div style={{ fontSize: 30, color: '#706e64' }}>
          Thoughts and experiences in software engineering.
        </div>
      </div>
      <div style={{ display: 'flex', fontSize: 24, justifyContent: 'space-between' }}>
        <span>Software Engineer</span>
        <span>KO / EN</span>
      </div>
    </div>,
    size,
  );
}
