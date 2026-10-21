import { locale as rootLocale } from 'next/root-params';

import { BoardsTopbar } from '@/_pages/boards';

export default async function Page() {
  return <BoardsTopbar locale={await rootLocale()} slug="friend-sale" />;
}

export const instant = false;
