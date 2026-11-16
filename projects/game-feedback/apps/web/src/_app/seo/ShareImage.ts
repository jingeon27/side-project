import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const artwork = readFile(join(process.cwd(), 'public/brand/og-image.png'));

export async function createShareImage() {
  return new Response(new Uint8Array(await artwork), {
    headers: { 'Content-Type': 'image/png' },
  });
}
