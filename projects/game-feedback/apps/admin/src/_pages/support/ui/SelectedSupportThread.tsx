import { useSuspenseQuery } from '@tanstack/react-query';

import { threadOptions } from '@/features/support';
import { SupportConversation } from '@/widgets/support-conversation';

/** 주소의 문의를 목록 페이지와 상관없이 직접 받아 대화를 연다. */
export function SelectedSupportThread({ id }: { id: string }) {
  const { data: thread } = useSuspenseQuery(threadOptions(id));
  return <SupportConversation thread={thread} />;
}
