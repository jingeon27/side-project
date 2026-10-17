'use client';
import { useEffect } from 'react';
import { overlay } from 'overlay-kit';
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@side/design-system';
import { Menu, Flag, Trash2, ShieldBan } from 'lucide-react';
import { openUserReport } from '@/widgets/moderation';
import type { Author } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { openOverlay } from '@/shared/ui';
import { useChatBlock } from '../model/use-chat-block';
import { ClearConversationDialog } from './ClearConversationDialog';

interface IConversationActionsProps {
  userId: string;
  conversationId: string;
  locale: string;
  peer: Author;
  throughMessageId?: string;
}
export function ConversationActions({
  userId,
  conversationId,
  locale,
  peer,
  throughMessageId,
}: IConversationActionsProps) {
  const { t } = useI18n();
  const { handleBlock } = useChatBlock({ userId, conversationId, locale });
  const clearOverlayId = `clear-chat:${userId}:${conversationId}`;
  const reportOverlayId = `report-chat:${userId}:${conversationId}`;
  useEffect(
    () => () => {
      overlay.unmount(clearOverlayId);
      overlay.unmount(reportOverlayId);
    },
    [clearOverlayId, reportOverlayId],
  );
  function handleClear() {
    if (!throughMessageId) return;
    openOverlay(
      ({ isOpen, close, unmount }) => (
        <ClearConversationDialog
          open={isOpen}
          userId={userId}
          conversationId={conversationId}
          throughMessageId={throughMessageId}
          onOpenChange={(next) => {
            if (next) return;
            close();
            unmount();
          }}
        />
      ),
      { overlayId: clearOverlayId },
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" type="button" aria-label={t('대화 메뉴')} />}
      >
        <Menu size={19} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => openUserReport(peer.id, reportOverlayId)}>
          <Flag aria-hidden="true" />
          {t('사용자 신고')}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!throughMessageId} onClick={handleClear}>
          <Trash2 aria-hidden="true" />
          {t('대화내역 삭제')}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => handleBlock(peer)}>
          <ShieldBan aria-hidden="true" />
          {t('차단')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
