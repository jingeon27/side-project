'use client';

import { useRouter } from 'next/navigation';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { appRoutes } from '@game-feedback/bridge';
import { Button } from '@side/design-system';

import { clearChatHistoryMutationOptions } from '@/features/chat';
import { useI18n } from '@/shared/i18n';
import { ErrorNotice, Modal, useNotify } from '@/shared/ui';

interface IClearConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  conversationId: string;
  throughMessageId: string;
}
export function ClearConversationDialog({
  open,
  onOpenChange,
  userId,
  conversationId,
  throughMessageId,
}: IClearConversationDialogProps) {
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const mutation = useMutation(clearChatHistoryMutationOptions(client, userId, conversationId));
  const router = useRouter();
  const notify = useNotify();
  async function handleClear() {
    try {
      await mutation.mutateAsync(throughMessageId);
      onOpenChange(false);
      router.replace(appRoutes.messages(locale), { scroll: false });
      notify(t('대화내역을 삭제했어요.'));
    } catch {
      /* Keep the failed action and retry inside this dialog. */
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      dismissible={!mutation.isPending}
      title={t('대화내역 삭제')}
      description={t(
        '현재까지의 대화내역을 내 계정에서 삭제합니다. 상대방의 내역은 유지되며, 새 메시지는 다시 받을 수 있어요.',
      )}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            disabled={mutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('취소')}
          </Button>
          <Button
            type="button"
            variant="danger"
            loading={mutation.isPending}
            onClick={() => void handleClear()}
          >
            {t('대화내역 삭제')}
          </Button>
        </>
      }
    >
      <ErrorNotice message={mutation.error?.message} />
    </Modal>
  );
}
