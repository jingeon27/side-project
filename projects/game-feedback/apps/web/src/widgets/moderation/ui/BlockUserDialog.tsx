'use client';
import { useI18n } from '@/shared/i18n';
import { Button } from '@side/design-system';
import type { Author } from '@/shared/api';
import { ErrorNotice, Modal } from '@/shared/ui';
import { useBlockUserMutation } from '@/features/moderation';
interface IBlockUserDialogProps {
  author: Author;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBlocked: () => void;
}
export function BlockUserDialog({ author, open, onOpenChange, onBlocked }: IBlockUserDialogProps) {
  const { t } = useI18n();
  const mutation = useBlockUserMutation();
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
    >
      <div className="form-stack">
        <ErrorNotice message={mutation.error?.message} />
        <Button
          variant="danger"
          size="lg"
          fullWidth
          type="button"
          className="button danger full"
          loading={mutation.isPending}
          onClick={handleBlock}
        >
          {t('차단하기')}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          className="button outline full"
          type="button"
          disabled={mutation.isPending}
          onClick={() => onOpenChange(false)}
        >
          {t('돌아가기')}
        </Button>
      </div>
    </Modal>
  );
}
