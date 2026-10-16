'use client';
import { LoaderCircle } from 'lucide-react';
import type { Author } from '@/shared/api';
import { ErrorNotice, Modal } from '@/shared/ui';
import { useBlockUserMutation } from '@/features/moderation';
interface IBlockUserDialogProps {
  author: Author;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBlocked?: () => void;
}
export function BlockUserDialog({ author, open, onOpenChange, onBlocked }: IBlockUserDialogProps) {
  const mutation = useBlockUserMutation();
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      dismissible={!mutation.isPending}
      title={`${author.nickname}님을 차단할까요?`}
      description="서로의 게시글과 대화가 숨겨지며 메시지를 더 이상 주고받을 수 없어요. 설정에서 차단을 해제할 수 있습니다."
    >
      <form
        className="form-stack"
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await mutation.mutateAsync({ blockedUserId: author.id });
            onOpenChange(false);
            onBlocked?.();
          } catch {
            /* The mutation error remains visible in the dialog. */
          }
        }}
      >
        <ErrorNotice message={mutation.error?.message} />
        <button className="button danger full" disabled={mutation.isPending}>
          {mutation.isPending && <LoaderCircle className="spin" size={16} />}차단하기
        </button>
        <button
          className="button outline full"
          type="button"
          disabled={mutation.isPending}
          onClick={() => onOpenChange(false)}
        >
          돌아가기
        </button>
      </form>
    </Modal>
  );
}
