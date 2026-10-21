export function resolveSeoConfig(env: Record<string, string | undefined>) {
  const url = new URL(
    env.GAME_FEEDBACK_SITE_URL ||
      env.WEB_ORIGIN ||
      (env.NODE_ENV === 'production' ? 'https://game.bambyul.com' : 'http://localhost:3300'),
  );
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('GAME_FEEDBACK_SITE_URL must be an HTTP(S) origin.');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  return {
    origin: url.origin,
    indexable:
      env.NODE_ENV === 'production' &&
      env.GAME_FEEDBACK_INDEXING === 'true' &&
      env.GF_DEMO_MODE !== 'true' &&
      url.protocol === 'https:' &&
      !local,
  };
}
export function getSeoConfig() {
  return resolveSeoConfig(process.env);
}
export function canonicalPath(path: string) {
  if (/^\/(ko|en|ja)\/(guide|terms|privacy|contact)(?:[/?]|$)/.test(path)) return path;
  return path.replace(/^\/(ko|en|ja)(?=\/|$)/, '/ko');
}
export function pageUrl(path: string) {
  return new URL(canonicalPath(path), getSeoConfig().origin).toString();
}
export function excerpt(text: string, length = 160) {
  const normalized = text
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = Array.from(normalized);
  return chars.length > length ? `${chars.slice(0, length - 1).join('')}…` : normalized;
}
