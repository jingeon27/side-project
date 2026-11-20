import { parseSearch } from '@/shared/lib/query-string.helper';

export function validPostLink(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const url = new URL(value.trim());
    return (
      value.trim().length <= 2048 &&
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function youtubeVideoId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const id = youtubeIdCandidate(url);
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function youtubeIdCandidate(url: URL) {
  const paths = url.pathname.split('/').filter(Boolean);
  if (url.hostname === 'youtu.be' && paths.length === 1) return paths[0];
  if (!['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) return null;
  if (url.pathname === '/watch') return parseSearch(url.search).v;
  if (paths.length === 2 && ['shorts', 'embed', 'live'].includes(paths[0] ?? '')) return paths[1];
  return null;
}
