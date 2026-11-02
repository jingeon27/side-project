import { Buffer } from 'node:buffer';

/** Callers supply only their own permission-checked media endpoints. */
export async function readSocialPreviewImage(url: URL): Promise<string | null> {
  try {
    const response = await fetch(url, {
      credentials: 'omit',
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    const type = response.headers.get('content-type')?.split(';')[0];
    const length = Number(response.headers.get('content-length'));
    if (
      !response.ok ||
      !type ||
      !/^image\/(png|jpeg|webp|gif)$/.test(type) ||
      !Number.isSafeInteger(length) ||
      length <= 0 ||
      length > 16 * 1024 * 1024
    ) {
      await response.body?.cancel();
      return null;
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 16 * 1024 * 1024) return null;
    return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
  } catch {
    return null;
  }
}
