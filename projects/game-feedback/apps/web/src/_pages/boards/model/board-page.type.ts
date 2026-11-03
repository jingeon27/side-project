import type { IBoardSnapshot } from './board-snapshot.type';

export interface IBoardPageProps {
  locale: string;
  initialBoard: IBoardSnapshot | Promise<IBoardSnapshot>;
}

export interface IBoardRouteProps {
  locale: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  blockUntilReady: boolean;
}
