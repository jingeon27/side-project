import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import { BrandMark } from '@/shared/ui/brand-mark';

const size = { width: 1200, height: 630 };
const brandImage = `data:image/png;base64,${readFileSync(
  join(process.cwd(), 'public/images/brand/bambyul-mascot.png'),
).toString('base64')}`;
export const dynamic = 'force-static';

// Korean and English pages share this one image, so it shows the brand mark without any text.
export function GET() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#21354d',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <BrandMark size={256} imageHref={brandImage} />
    </div>,
    size,
  );
}
