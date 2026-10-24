'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '@side/design-system';

import { blockUserMutationOptions } from '@/features/moderation';
import type { Author } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { ErrorNotice, Modal } from '@/shared/ui';

interface IBlockUserDialogProps {
  author: Author;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBlocked: () => void;
}
export function BlockUserDialog({ author, open, onOpenChange, onBlocked }: IBlockUserDialogProps) {
  const client = useQueryClient();
  const { t } = useI18n();
  const mutation = useMutation(blockUserMutationOptions(client));
  function handleBlock() {
    mutation.mutate(
      { blockedUserId: author.id },
      {
        onSuccess: () => {
          onOpenChange(false);
          onBlocked();
        },
      },
    );
  }
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      dismissible={!mutation.isPending}
      title={t('{name}님을 차단할까요?', { name: author.nickname })}
      description={t(
        '서로의 게시글과 대화가 숨겨지며 메시지를 더 이상 주고받을 수 없어요. 설정에서 차단을 해제할 수 있습니다.',
      )}
      footer={
        <>
          <Button
            variant="secondary"
            type="button"
            disabled={mutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('돌아가기')}
          </Button>
          <Button variant="danger" type="button" loading={mutation.isPending} onClick={handleBlock}>
            {t('차단하기')}
          </Button>
        </>
      }
    >
      <ErrorNotice message={mutation.error?.message} />
    </Modal>
  );
}
