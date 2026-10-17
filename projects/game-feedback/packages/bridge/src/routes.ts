import { z } from 'zod';

export const RouteIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const localeSchema = z.enum(['ko', 'en', 'ja']);
export type TAppTab = 'feed' | 'boards' | 'messages' | 'notifications' | 'settings' | 'guide';
export type TAppScreen = TAppTab | 'post' | 'profile' | 'conversation' | 'terms' | 'privacy' | 'contact';
export interface IAppRoute {
  path: string;
  pathname: string;
  locale: string;
  screen: TAppScreen;
  tab: TAppTab;
  parent: string | null;
}
function root(locale: string) {
  return `/${localeSchema.parse(locale)}`;
}
const boardSlugSchema = z.enum(['friend-sale', 'friendly']);
const boardSlugs: Record<string, string> = {
  FRIEND_SALE: 'friend-sale',
  FRIENDLY: 'friendly',
};
function queryPath(path: string, values: Record<string, string | undefined>) {
  const query = Object.entries(values)
    .filter((entry): entry is [string, string] => !!entry[1])
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return `${path}${query ? `?${query}` : ''}`;
}
export const appRoutes = {
  feed: (locale: string, filters: { q?: string; tab?: string } = {}) =>
    queryPath(root(locale), { tab: filters.tab === 'unanswered' ? 'unanswered' : undefined, q: filters.q }),
  post: (locale: string, id: string, board?: string) =>
    queryPath(`${root(locale)}/posts/${RouteIdSchema.parse(id)}`, {
      board: board ? boardSlugs[board] : undefined,
    }),
  boards: (locale: string, slug = 'friend-sale', q?: string) =>
    queryPath(`${root(locale)}/boards/${boardSlugSchema.parse(slug)}`, { q: q?.trim() }),
  profile: (locale: string, id: string, cursor?: string) =>
    queryPath(`${root(locale)}/users/${RouteIdSchema.parse(id)}`, { cursor }),
  messages: (locale: string) => `${root(locale)}/messages`,
  conversation: (locale: string, id: string) => `${root(locale)}/messages/${RouteIdSchema.parse(id)}`,
  notifications: (locale: string) => `${root(locale)}/notifications`,
  settings: (locale: string) => `${root(locale)}/settings`,
  guide: (locale: string) => `${root(locale)}/guide`,
};
function readQuery(search: string): Record<string, string> | null {
  const values: Record<string, string> = Object.create(null);
  try {
    for (const pair of search.split('&').filter(Boolean)) {
      const index = pair.indexOf('=');
      const decode = (text: string) => decodeURIComponent(text.replace(/\+/g, ' '));
      const key = decode(index < 0 ? pair : pair.slice(0, index));
      const value = decode(index < 0 ? '' : pair.slice(index + 1));
      if (key in values || /[\u0000-\u001f\u007f]/.test(key + value)) return null;
      values[key] = value;
    }
    return values;
  } catch {
    return null;
  }
}
export function resolveAppRoute(path: string): IAppRoute | null {
  if (path.length > 2048 || /[\\#\u0000-\u0020\u007f]/.test(path)) return null;
  const [rawPath = '', search = '', extra] = path.split('?');
  if (extra !== undefined) return null;
  const pathname = rawPath.replace(/\/$/, '');
  const match =
    /^\/(ko|en|ja)(?:\/(posts|users|messages|boards)\/([A-Za-z0-9_-]{1,100})|\/(boards|messages|notifications|settings|guide|terms|privacy|contact))?$/.exec(
      pathname,
    );
  if (!match) return null;
  const locale = match[1] ?? 'ko';
  const query = readQuery(search);
  if (!query) return null;
  const home = root(locale);
  const id = match[3];
  const kind = match[2] ?? match[4];
  if (kind === 'posts' && id) {
    const board = query.board ? boardSlugSchema.safeParse(query.board) : null;
    if (board && !board.success) return null;
    return {
      path: queryPath(pathname, { board: board?.success ? board.data : undefined }),
      pathname,
      locale,
      screen: 'post',
      tab: board ? 'boards' : 'feed',
      parent: board?.success ? appRoutes.boards(locale, board.data) : home,
    };
  }
  if (kind === 'boards') {
    const slug = boardSlugSchema.safeParse(id ?? 'friend-sale');
    if (!slug.success || (query.q?.length ?? 0) > 100) return null;
    return {
      path: appRoutes.boards(locale, slug.data, query.q),
      pathname,
      locale,
      screen: 'boards',
      tab: 'boards',
      parent: home,
    };
  }
  if (kind === 'users' && id) {
    if ((query.cursor?.length ?? 0) > 200) return null;
    return {
      path: appRoutes.profile(locale, id, query.cursor),
      pathname,
      locale,
      screen: 'profile',
      tab: 'feed',
      parent: home,
    };
  }
  if (kind === 'messages') {
    const conversation = id ?? query.conversation;
    if (conversation && !RouteIdSchema.safeParse(conversation).success) return null;
    const href = conversation ? appRoutes.conversation(locale, conversation) : appRoutes.messages(locale);
    return {
      path: href,
      pathname: href,
      locale,
      screen: conversation ? 'conversation' : 'messages',
      tab: 'messages',
      parent: conversation ? appRoutes.messages(locale) : home,
    };
  }
  if (kind) {
    const screen = kind as Exclude<TAppScreen, 'feed' | 'post' | 'profile' | 'conversation' | 'messages'>;
    return {
      path: pathname,
      pathname,
      locale,
      screen,
      tab: ['settings', 'notifications', 'guide'].includes(screen) ? (screen as TAppTab) : 'guide',
      parent: home,
    };
  }
  const q = query.q?.trim();
  if ((q?.length ?? 0) > 100) return null;
  return {
    path: appRoutes.feed(locale, { q, tab: query.tab }),
    pathname,
    locale,
    screen: 'feed',
    tab: 'feed',
    parent: null,
  };
}

export const WebPathSchema = z
  .string()
  .max(2048)
  .transform((path, context) => {
    const route = resolveAppRoute(path);
    if (route) return route.path;
    context.addIssue({ code: 'custom', message: 'Unsupported application route.' });
    return z.NEVER;
  });
