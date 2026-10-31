import { compact } from 'es-toolkit';
import { match } from 'ts-pattern';
import { z } from 'zod';

import {
  BattleModeSchema as battleModeSchema,
  BoardQuerySchema,
  BoardSlugSchema as boardSlugSchema,
  CoachingRoleSchema as coachingRoleSchema,
  FeedbackStatusSchema as feedbackStatusSchema,
  GameSlugSchema,
} from './board-query';

export const RouteIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const localeSchema = z.enum(['ko', 'en', 'ja']);
export type TAppTab = 'feed' | 'boards' | 'messages' | 'notifications' | 'settings';
export type TAppScreen =
  | TAppTab
  | 'search'
  | 'post'
  | 'compose'
  | 'profile-edit'
  | 'profile'
  | 'conversation'
  | 'guide'
  | 'terms'
  | 'privacy'
  | 'contact'
  | 'login'
  | 'onboarding';
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
interface IRecruitmentFilters {
  battleMode?: z.infer<typeof battleModeSchema>;
  coachingRole?: z.infer<typeof coachingRoleSchema>;
}
interface IBoardFilters extends IRecruitmentFilters {
  feedbackStatus?: z.infer<typeof feedbackStatusSchema>;
}
type TBoardKind = 'FEEDBACK' | 'COACHING' | 'FREE' | 'FRIEND_SALE' | 'FRIENDLY';
type TBoardSlug = z.infer<typeof boardSlugSchema>;
// 호출자가 넘기는 게시판 종류는 열린 문자열이라 조회 타입은 넓히고, 표는 모든 종류를 slug로 잇는지 검사한다.
const boardSlugs: Record<string, TBoardSlug> = {
  FEEDBACK: 'feedback',
  COACHING: 'coaching',
  FREE: 'free',
  FRIEND_SALE: 'friend-sale',
  FRIENDLY: 'friendly',
} satisfies Record<TBoardKind, TBoardSlug>;
function queryPath(path: string, values: Record<string, string | undefined>) {
  const query = compact(
    Object.entries(values).map(([key, value]) =>
      value ? `${encodeURIComponent(key)}=${encodeURIComponent(value)}` : undefined,
    ),
  ).join('&');
  return `${path}${query ? `?${query}` : ''}`;
}
export const appRoutes = {
  login: (locale: string, returnTo?: string) => queryPath(`${root(locale)}/login`, { returnTo }),
  onboarding: (locale: string, returnTo?: string) => queryPath(`${root(locale)}/onboarding`, { returnTo }),
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
  editProfile: (locale: string) => `${root(locale)}/settings/profile`,
  settings: (locale: string) => `${root(locale)}/settings`,
  contact: (locale: string) => `${root(locale)}/contact`,
  guide: (locale: string) => `${root(locale)}/guide`,
  terms: (locale: string) => `${root(locale)}/terms`,
  privacy: (locale: string) => `${root(locale)}/privacy`,
};
function readQuery(search: string): Record<string, string> | null {
  const values: Record<string, string> = Object.create(null);
  try {
    return compact(search.split('&')).reduce<Record<string, string> | null>((result, pair) => {
      if (!result) return null;
      const index = pair.indexOf('=');
      const decode = (text: string) => decodeURIComponent(text.replace(/\+/g, ' '));
      const key = decode(index < 0 ? pair : pair.slice(0, index));
      const value = decode(index < 0 ? '' : pair.slice(index + 1));
      if (key in result || /[\u0000-\u001f\u007f]/.test(key + value)) return null;
      result[key] = value;
      return result;
    }, values);
  } catch {
    return null;
  }
}
export function resolveAppRoute(path: string): IAppRoute | null {
  if (path.length > 2048 || /[\\#\u0000-\u0020\u007f]/.test(path)) return null;
  const [rawPath = '', search = '', extra] = path.split('?');
  if (extra !== undefined) return null;
  const pathname = rawPath.replace(/\/$/, '');
  const segments =
    /^\/(ko|en|ja)(?:\/(posts|users|messages|boards)\/([A-Za-z0-9_-]{1,100})|\/(login|onboarding|search|boards|write|messages|notifications|settings\/profile|settings|guide|terms|privacy|contact))?$/.exec(
      pathname,
    );
  if (!segments) return null;
  const locale = segments[1] ?? 'ko';
  const query = readQuery(search);
  if (!query) return null;
  const game = GameSlugSchema.safeParse(query.game ?? 'clash-royale');
  if (!game.success) return null;
  const home = root(locale);
  const id = segments[3];
  const kind = segments.at(2) ?? segments.at(4);
  const feedback = feedbackStatusSchema.optional().safeParse(query.feedbackStatus);
  if (!feedback.success || (feedback.data && !['search', 'boards'].includes(kind ?? ''))) return null;
  const context = { pathname, locale, home, query, game: game.data, id, feedback: feedback.data };
  return match(kind)
    .with('login', 'onboarding', (screen) => resolveAuthRoute(context, screen))
    .with('settings/profile', () => ({
      path: appRoutes.editProfile(locale),
      pathname,
      locale,
      screen: 'profile-edit' as const,
      tab: 'settings' as const,
      parent: appRoutes.settings(locale),
    }))
    .with('search', () => resolveSearchRoute(context))
    .with('write', () => resolveComposeRoute(context))
    .with('posts', () => resolvePostRoute(context))
    .with('boards', () => resolveBoardRoute(context))
    .with('users', () => resolveProfileRoute(context))
    .with('messages', () => resolveMessagesRoute(context))
    .with(undefined, () => resolveFeedRoute(context))
    .otherwise((kind) => resolveStaticRoute(context, kind));
}

interface IRouteContext {
  pathname: string;
  locale: string;
  home: string;
  query: Record<string, string>;
  game: string;
  id?: string;
  feedback?: z.infer<typeof feedbackStatusSchema>;
}

function resolveAuthRoute(
  { pathname, locale, home, query }: IRouteContext,
  screen: 'login' | 'onboarding',
): IAppRoute | null {
  // 인증 화면을 목적지로 받으면 로그인과 가입 안내 사이에 복귀 경로가 순환한다.
  if (query.returnTo && /^\/(ko|en|ja)\/(login|onboarding)(?:[/?]|$)/.test(query.returnTo)) return null;
  const destination = query.returnTo ? resolveAppRoute(query.returnTo) : null;
  if (query.returnTo && (!destination || destination.locale !== locale)) return null;
  return {
    path: appRoutes[screen](locale, destination?.path),
    pathname,
    locale,
    screen,
    tab: 'settings',
    parent: destination?.path ?? home,
  };
}

function resolveSearchRoute({ pathname, locale, query, game, feedback }: IRouteContext): IAppRoute | null {
  const parsed = BoardQuerySchema.safeParse(query);
  if (!parsed.success || (query.q?.length ?? 0) > 100) return null;
  const { board, battleMode, coachingRole } = parsed.data;
  const filters = {
    board,
    feedbackStatus: feedback,
    game: query.game,
    q: query.q,
    tab: query.tab,
    battleMode,
    coachingRole,
  };
  return {
    path: appRoutes.search(locale, filters),
    pathname,
    locale,
    screen: 'search',
    tab: board ? 'boards' : 'feed',
    game: board || query.game ? game : undefined,
    parent: board
      ? appRoutes.boards(locale, board, query.q, game, filters)
      : appRoutes.feed(locale, { q: query.q, tab: query.tab }),
  };
}

function resolveComposeRoute({ pathname, locale, home, query, game }: IRouteContext): IAppRoute | null {
  const parsed = BoardQuerySchema.safeParse(query);
  if (!parsed.success) return null;
  const { board, battleMode, coachingRole } = parsed.data;
  return {
    path: queryPath(pathname, {
      board,
      game: game !== 'clash-royale' ? game : undefined,
      battleMode,
      coachingRole,
    }),
    game,
    pathname,
    locale,
    screen: 'compose',
    tab: board ? 'boards' : 'feed',
    parent: board ? appRoutes.boards(locale, board, undefined, game, { battleMode, coachingRole }) : home,
  };
}

function resolvePostRoute({ pathname, locale, home, query, game, id }: IRouteContext): IAppRoute | null {
  if (!id) return null;
  const board = query.board ? boardSlugSchema.safeParse(query.board) : null;
  if (board && !board.success) return null;
  return {
    path: queryPath(pathname, {
      board: board?.success ? board.data : undefined,
      game: board && game !== 'clash-royale' ? game : undefined,
    }),
    game: game,
    pathname,
    locale,
    screen: 'post',
    tab: board ? 'boards' : 'feed',
    parent: board?.success ? appRoutes.boards(locale, board.data, undefined, game) : home,
  };
}

function resolveBoardRoute({ pathname, locale, home, query, game, id }: IRouteContext): IAppRoute | null {
  const parsed = BoardQuerySchema.safeParse({ ...query, board: id ?? 'feedback' });
  if (!parsed.success || !parsed.data.board || (query.q?.length ?? 0) > 100) return null;
  const { board, feedbackStatus, battleMode, coachingRole } = parsed.data;
  return {
    path: appRoutes.boards(locale, board, query.q, game, { feedbackStatus, battleMode, coachingRole }),
    game,
    pathname,
    locale,
    screen: 'boards',
    tab: 'boards',
    parent: home,
  };
}

function resolveProfileRoute({ pathname, locale, home, query, id }: IRouteContext): IAppRoute | null {
  if (!id) return null;
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

function resolveMessagesRoute({ locale, home, query, id }: IRouteContext): IAppRoute | null {
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

function resolveStaticRoute({ pathname, locale, home }: IRouteContext, kind: string): IAppRoute | null {
  const screen = match(kind)
    .with('notifications', 'settings', 'guide', 'terms', 'privacy', 'contact', (screen) => screen)
    .otherwise(() => null);
  if (!screen) return null;
  const tab = match(screen)
    .returnType<TAppTab>()
    .with('notifications', () => 'notifications')
    .with('settings', 'guide', 'terms', 'privacy', 'contact', () => 'settings')
    .exhaustive();
  return {
    path: pathname,
    pathname,
    locale,
    screen,
    tab,
    parent: screen === 'guide' ? appRoutes.settings(locale) : home,
  };
}

function resolveFeedRoute({ pathname, locale, query }: IRouteContext): IAppRoute | null {
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
