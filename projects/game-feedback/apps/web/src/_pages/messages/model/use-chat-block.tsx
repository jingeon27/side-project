import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { overlay } from 'overlay-kit';
import { chatMessageOptions } from '@/features/chat';
import { BlockUserDialog } from '@/widgets/moderation';
import type { Author } from '@/shared/api';
import { openOverlay, useNotify } from '@/shared/ui';

interface IChatBlockOptions {
  userId: string;
  conversationId: string;
  locale: string;
}

export function useChatBlock({ userId, conversationId, locale }: IChatBlockOptions) {
  const client = useQueryClient();
  const router = useRouter();
  const notify = useNotify();
  const dialogId = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (dialogId.current) overlay.unmount(dialogId.current);
    },
    [],
  );

  function handleBlock(author: Author) {
    dialogId.current = openOverlay(({ isOpen, close, unmount }) => (
      <BlockUserDialog
        author={author}
        open={isOpen}
        onOpenChange={(nextOpen) => {
          if (nextOpen) return;
          close();
          unmount();
        }}
        onBlocked={() => {
          client.removeQueries(chatMessageOptions(userId, conversationId));
          router.replace(`/${locale}/messages`, { scroll: false });
          notify('사용자를 차단했어요. 더 이상 메시지를 주고받을 수 없어요.');
        }}
      />
    ));
  }

  return { handleBlock };
}
