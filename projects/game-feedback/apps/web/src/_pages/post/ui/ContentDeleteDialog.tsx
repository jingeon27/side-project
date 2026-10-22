'use client';

import { useRouter } from 'next/navigation';

import { LoaderCircle } from 'lucide-react';

import { appRoutes } from '@game-feedback/bridge';
import { Button } from '@side/design-system';

import { useDeleteAnswerMutation } from '@/features/answer';
import { useDeleteCommentMutation } from '@/features/comment';
import { useDeletePostMutation } from '@/features/post';
import { useI18n } from '@/shared/i18n';
import { ErrorNotice, Modal, useNotify } from '@/shared/ui';

interface IContentDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'POST' | 'ANSWER' | 'COMMENT';
  id: string;
  postId: string;
  locale: string;
}
export function ContentDeleteDialog({
  open,
  onOpenChange,
  type,
  id,
  postId,
  locale,
}: IContentDeleteDialogProps) {
  const { t } = useI18n();
  const post = useDeletePostMutation(),
    answer = useDeleteAnswerMutation(),
    comment = useDeleteCommentMutation(),
    notify = useNotify(),
    router = useRouter();
  const isPending = post.isPending || answer.isPending || comment.isPending,
    error = post.error || answer.error || comment.error;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      dismissible={!isPending}
      title={t('정말 삭제할까요?')}
      description={t(
        type === 'COMMENT'
          ? '댓글을 삭제해도 다른 사람이 남긴 답글은 유지됩니다.'
          : '삭제한 내용은 복구할 수 없어요. 요청을 삭제하면 연결된 피드백과 댓글도 보이지 않게 됩니다.',
      )}
    >
      <form
        className="form-stack"
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            if (type === 'POST') await post.mutateAsync({ id });
            if (type === 'ANSWER') await answer.mutateAsync({ id, postId });
            if (type === 'COMMENT') await comment.mutateAsync({ id, postId });
            onOpenChange(false);
            notify(t('삭제했어요.'));
            // 지운 글의 기록을 남기지 않아 뒤로 가기가 404 문서를 다시 열지 않는다.
            if (type === 'POST') router.replace(appRoutes.feed(locale));
          } catch {
            /* Mutation errors remain visible. */
          }
        }}
      >
        <ErrorNotice message={error?.message} />
        <Button
          variant="danger"
          size="lg"
          fullWidth
          type="submit"
          className="button danger full"
          disabled={isPending}
        >
          {isPending && <LoaderCircle className="spin" size={16} />}
          {t('삭제하기')}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          className="button outline full"
          type="button"
          disabled={isPending}
          onClick={() => onOpenChange(false)}
        >
          {t('돌아가기')}
        </Button>
      </form>
    </Modal>
  );
}
