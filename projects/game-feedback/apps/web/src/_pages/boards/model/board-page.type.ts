import type { IBoardSnapshot } from './board-snapshot.type';

export interface IBoardPageProps {
  locale: string;
  initialBoard: IBoardSnapshot | Promise<IBoardSnapshot>;
}
