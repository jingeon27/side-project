import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const alt = '피식. 혼자 보기 아까운 순간. 사진과 동영상을 모으는 그룹 커뮤니티.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const artwork = readFile(join(process.cwd(), 'public/brand/og-image.png'));

export default async function Image() {
  return new Response(new Uint8Array(await artwork), {
    headers: { 'Content-Type': contentType },
  });
}
