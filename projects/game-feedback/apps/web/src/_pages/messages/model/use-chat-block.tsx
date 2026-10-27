import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useQueryClient } from '@tanstack/react-query';
import { overlay } from 'overlay-kit';

import { appRoutes } from '@game-feedback/bridge';

import { chatMessageOptions } from '@/features/chat';
import type { Author } from '@/shared/api';
import { openOverlay, useNotify } from '@/shared/ui';
import { BlockUserDialog } from '@/widgets/moderation';

interface IChatBlockOptions {
  userId: string;
  conversationId: string;
  locale: string;
}

export function useChatBlock({ userId, conversationId, locale }: IChatBlockOptions) {
  const client = useQueryClient();
  const router = useRouter();
  const notify = useNotify();
  const overlayId = `block-chat:${userId}:${conversationId}`;

  useEffect(
    () => () => {
      overlay.unmount(overlayId);
    },
    [overlayId],
  );

  function handleBlock(author: Author) {
    openOverlay(
      (control) => (
        <BlockUserDialog
          {...control}
          author={author}
          onBlocked={() => {
            client.removeQueries(chatMessageOptions(userId, conversationId));
            router.replace(appRoutes.messages(locale), { scroll: false });
            notify('사용자를 차단했어요. 더 이상 메시지를 주고받을 수 없어요.');
          }}
        />
      ),
      { overlayId },
    );
  }

  return { handleBlock };
}
