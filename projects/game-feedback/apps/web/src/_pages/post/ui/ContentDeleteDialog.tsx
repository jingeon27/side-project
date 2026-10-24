'use client';

import { useId } from 'react';
import { useRouter } from 'next/navigation';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';

import { appRoutes } from '@game-feedback/bridge';
import { Button } from '@side/design-system';

import { deleteAnswerMutationOptions } from '@/features/answer';
import { deleteCommentMutationOptions } from '@/features/comment';
import { deletePostMutationOptions } from '@/features/post';
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
  const client = useQueryClient();
  const { t } = useI18n();
  const formId = useId();
  const post = useMutation(deletePostMutationOptions(client)),
    answer = useMutation(deleteAnswerMutationOptions(client)),
    comment = useMutation(deleteCommentMutationOptions(client)),
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
      footer={
        <>
          <Button variant="secondary" type="button" disabled={isPending} onClick={() => onOpenChange(false)}>
            {t('돌아가기')}
          </Button>
          <Button variant="danger" size="lg" type="submit" form={formId} disabled={isPending}>
            {isPending && <LoaderCircle className="spin" size={16} />}
            {t('삭제하기')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
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
      </form>
    </Modal>
  );
}
