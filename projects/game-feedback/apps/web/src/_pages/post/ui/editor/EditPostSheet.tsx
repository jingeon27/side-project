'use client';

import { useId } from 'react';
import { useRouter } from 'next/navigation';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';

import { Button, Input } from '@side/design-system';

import { boardByKind } from '@/features/board';
import { updatePostMutationOptions } from '@/features/post';
import type { Post } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { BottomSheet, Field, useNotify, type IOverlayControlProps } from '@/shared/ui';
import { PostComposerFields, usePostComposer } from '@/widgets/post-composer';

interface IEditPostSheetProps extends IOverlayControlProps {
  post: Post;
}
export function EditPostSheet({ open, onOpenChange, onOpenChangeComplete, post }: IEditPostSheetProps) {
  const client = useQueryClient();
  const { t } = useI18n();
  const formId = useId();
  const router = useRouter();
  const notify = useNotify();
  const update = useMutation(updatePostMutationOptions(client));
  const composer = usePostComposer({
    save: update,
    defaultValues: {
      title: post.title,
      body: post.body,
      document: post.document ?? undefined,
      board: post.board,
      categoryId: post.categoryId,
      coaching: post.coaching,
      friendSale: post.friendSale,
      battle: post.battle,
    },
  });
  const handleSubmit = composer.handleSubmit(async (input) => {
    try {
      await update.mutateAsync({ id: post.id, body: input });
      onOpenChange(false);
      notify(t('요청을 수정했어요.'));
      router.refresh();
    } catch {
      /* Keep the edited draft and errors. */
    }
  });
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      dismissible={!composer.pending}
      title={t(post.board === 'FEEDBACK' ? '피드백 요청 수정' : '게시글 수정')}
      description={t('나누고 싶은 내용을 다듬어주세요.')}
      footer={
        <>
          <Button
            variant="secondary"
            type="button"
            disabled={composer.pending}
            onClick={() => onOpenChange(false)}
          >
            {t('취소')}
          </Button>
          <Button
            variant="accent"
            size="lg"
            type="submit"
            form={formId}
            loading={composer.pending}
            icon={<Check aria-hidden />}
          >
            {t('수정 완료')}
          </Button>
        </>
      }
    >
      <form id={formId} className="form-stack" aria-label={t('게시글 수정')} onSubmit={handleSubmit}>
        <PostComposerFields composer={composer}>
          <Field label={t('분류')}>
            <Input readOnly value={t(boardByKind(post.board)?.name ?? '게시글')} />
          </Field>
        </PostComposerFields>
      </form>
    </BottomSheet>
  );
}
