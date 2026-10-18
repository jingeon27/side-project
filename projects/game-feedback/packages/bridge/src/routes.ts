import { z } from 'zod';

export const RouteIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const localeSchema = z.enum(['ko', 'en', 'ja']);
export const GameSlugSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/)
  .max(40);
export type TAppTab = 'feed' | 'boards' | 'messages' | 'notifications' | 'settings' | 'guide';
export type TAppScreen =
  | TAppTab
  | 'search'
  | 'post'
  | 'compose'
  | 'profile'
  | 'conversation'
  | 'terms'
  | 'privacy'
  | 'contact'
  | 'admin';
export interface IAppRoute {
  path: string;
  pathname: string;
  locale: string;
  screen: TAppScreen;
  tab: TAppTab;
  parent: string | null;
  game?: string;
}
function root(locale: string) {
  return `/${localeSchema.parse(locale)}`;
}
const boardSlugSchema = z.enum(['feedback', 'friend-sale', 'friendly', 'coaching', 'free']);
const battleModeSchema = z.enum(['DUEL', 'TEAM']);
const coachingRoleSchema = z.enum(['COACH', 'STUDENT']);
const feedbackStatusSchema = z.enum(['WAITING', 'ANSWERED']);
interface IRecruitmentFilters {
  battleMode?: z.infer<typeof battleModeSchema>;
  coachingRole?: z.infer<typeof coachingRoleSchema>;
}
interface IBoardFilters extends IRecruitmentFilters {
  feedbackStatus?: z.infer<typeof feedbackStatusSchema>;
}
const boardSlugs: Record<string, string> = {
  FEEDBACK: 'feedback',
  COACHING: 'coaching',
  FREE: 'free',
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
  search: (
    locale: string,
    filters: IBoardFilters & { board?: string; game?: string; q?: string; tab?: string } = {},
  ) =>
    queryPath(`${root(locale)}/search`, {
      board: filters.board ? boardSlugSchema.parse(filters.board) : undefined,
      game: filters.game && filters.game !== 'clash-royale' ? GameSlugSchema.parse(filters.game) : undefined,
      q: filters.q?.trim(),
      tab: !filters.board && filters.tab === 'unanswered' ? 'unanswered' : undefined,
      feedbackStatus:
        filters.board === 'feedback' && filters.feedbackStatus
          ? feedbackStatusSchema.parse(filters.feedbackStatus)
          : undefined,
      battleMode:
        filters.board === 'friendly' && filters.battleMode
          ? battleModeSchema.parse(filters.battleMode)
          : undefined,
      coachingRole:
        filters.board === 'coaching' && filters.coachingRole
          ? coachingRoleSchema.parse(filters.coachingRole)
          : undefined,
    }),
  compose: (locale: string, board?: string, game?: string, filters: IRecruitmentFilters = {}) =>
    queryPath(`${root(locale)}/write`, {
      board: board ? boardSlugs[board] : undefined,
      game: game && game !== 'clash-royale' ? GameSlugSchema.parse(game) : undefined,
      battleMode:
        board === 'FRIENDLY' && filters.battleMode ? battleModeSchema.parse(filters.battleMode) : undefined,
      coachingRole:
        board === 'COACHING' && filters.coachingRole
          ? coachingRoleSchema.parse(filters.coachingRole)
          : undefined,
    }),
  post: (locale: string, id: string, board?: string, game?: string) =>
    queryPath(`${root(locale)}/posts/${RouteIdSchema.parse(id)}`, {
      board: board ? boardSlugs[board] : undefined,
      game: board && game && game !== 'clash-royale' ? GameSlugSchema.parse(game) : undefined,
    }),
  boards: (locale: string, slug = 'feedback', q?: string, game?: string, filters: IBoardFilters = {}) =>
    queryPath(`${root(locale)}/boards/${boardSlugSchema.parse(slug)}`, {
      game: game && game !== 'clash-royale' ? GameSlugSchema.parse(game) : undefined,
      q: q?.trim(),
      feedbackStatus:
        slug === 'feedback' && filters.feedbackStatus
          ? feedbackStatusSchema.parse(filters.feedbackStatus)
          : undefined,
      battleMode:
        slug === 'friendly' && filters.battleMode ? battleModeSchema.parse(filters.battleMode) : undefined,
      coachingRole:
        slug === 'coaching' && filters.coachingRole
          ? coachingRoleSchema.parse(filters.coachingRole)
          : undefined,
    }),
  profile: (locale: string, id: string, cursor?: string) =>
    queryPath(`${root(locale)}/users/${RouteIdSchema.parse(id)}`, { cursor }),
  messages: (locale: string) => `${root(locale)}/messages`,
  conversation: (locale: string, id: string) => `${root(locale)}/messages/${RouteIdSchema.parse(id)}`,
  notifications: (locale: string) => `${root(locale)}/notifications`,
  settings: (locale: string) => `${root(locale)}/settings`,
  admin: (locale: string) => `${root(locale)}/admin`,
  contact: (locale: string) => `${root(locale)}/contact`,
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
    /^\/(ko|en|ja)(?:\/(posts|users|messages|boards)\/([A-Za-z0-9_-]{1,100})|\/(search|boards|write|messages|notifications|settings|guide|terms|privacy|contact|admin))?$/.exec(
      pathname,
    );
  if (!match) return null;
  const locale = match[1] ?? 'ko';
  const query = readQuery(search);
  if (!query) return null;
  const game = GameSlugSchema.safeParse(query.game ?? 'clash-royale');
  if (!game.success) return null;
  const home = root(locale);
  const id = match[3];
  const kind = match[2] ?? match[4];
  const feedback = feedbackStatusSchema.optional().safeParse(query.feedbackStatus);
  if (!feedback.success || (feedback.data && !['search', 'boards'].includes(kind ?? ''))) return null;
  if (kind === 'search') {
    const board = boardSlugSchema.optional().safeParse(query.board);
    if (feedback.data && query.board !== 'feedback') return null;
    const battle = battleModeSchema.optional().safeParse(query.battleMode);
    const coaching = coachingRoleSchema.optional().safeParse(query.coachingRole);
    if (!board.success || !battle.success || !coaching.success || (query.q?.length ?? 0) > 100) return null;
    if ((battle.data && board.data !== 'friendly') || (coaching.data && board.data !== 'coaching'))
      return null;
    const filters = {
      board: board.data,
      feedbackStatus: feedback.data,
      game: query.game,
      q: query.q,
      tab: query.tab,
      battleMode: battle.data,
      coachingRole: coaching.data,
    };
    return {
      path: appRoutes.search(locale, filters),
      pathname,
      locale,
      screen: 'search',
      tab: board.data ? 'boards' : 'feed',
      game: board.data || query.game ? game.data : undefined,
      parent: board.data
        ? appRoutes.boards(locale, board.data, query.q, game.data, filters)
        : appRoutes.feed(locale, { q: query.q, tab: query.tab }),
    };
  }
  if (kind === 'write') {
    const board = query.board ? boardSlugSchema.safeParse(query.board) : null;
    if (board && !board.success) return null;
    const battle = battleModeSchema.optional().safeParse(query.battleMode);
    if (!battle.success || (battle.data && query.board !== 'friendly')) return null;
    const coaching = coachingRoleSchema.optional().safeParse(query.coachingRole);
    if (!coaching.success || (coaching.data && query.board !== 'coaching')) return null;
    return {
      path: queryPath(pathname, {
        board: board?.success ? board.data : undefined,
        game: game.data !== 'clash-royale' ? game.data : undefined,
        battleMode: battle.data,
        coachingRole: coaching.data,
      }),
      game: game.data,
      pathname,
      locale,
      screen: 'compose',
      tab: board ? 'boards' : 'feed',
      parent: board?.success
        ? appRoutes.boards(locale, board.data, undefined, game.data, {
            battleMode: battle.data,
            coachingRole: coaching.data,
          })
        : home,
    };
  }
  if (kind === 'posts' && id) {
    const board = query.board ? boardSlugSchema.safeParse(query.board) : null;
    if (board && !board.success) return null;
    return {
      path: queryPath(pathname, {
        board: board?.success ? board.data : undefined,
        game: board && game.data !== 'clash-royale' ? game.data : undefined,
      }),
      game: game.data,
      pathname,
      locale,
      screen: 'post',
      tab: board ? 'boards' : 'feed',
      parent: board?.success ? appRoutes.boards(locale, board.data, undefined, game.data) : home,
    };
  }
  if (kind === 'boards') {
    const slug = boardSlugSchema.safeParse(id ?? 'feedback');
    if (!slug.success || (query.q?.length ?? 0) > 100) return null;
    if (feedback.data && slug.data !== 'feedback') return null;
    const battle = battleModeSchema.optional().safeParse(query.battleMode);
    if (!battle.success || (battle.data && slug.data !== 'friendly')) return null;
    const coaching = coachingRoleSchema.optional().safeParse(query.coachingRole);
    if (!coaching.success || (coaching.data && slug.data !== 'coaching')) return null;
    return {
      path: appRoutes.boards(locale, slug.data, query.q, game.data, {
        feedbackStatus: feedback.data,
        battleMode: battle.data,
        coachingRole: coaching.data,
      }),
      game: game.data,
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
      tab:
        screen === 'admin' || screen === 'contact'
          ? 'settings'
          : ['settings', 'notifications', 'guide'].includes(screen)
            ? (screen as TAppTab)
            : 'guide',
      parent: screen === 'admin' ? appRoutes.settings(locale) : home,
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
