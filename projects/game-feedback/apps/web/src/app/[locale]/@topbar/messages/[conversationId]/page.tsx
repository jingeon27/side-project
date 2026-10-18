import { locale as rootLocale } from 'next/root-params';
import { ConversationTopbar } from '@/_pages/messages';

export default async function Page() {
  return <ConversationTopbar locale={await rootLocale()} />;
}

export const instant = false;
