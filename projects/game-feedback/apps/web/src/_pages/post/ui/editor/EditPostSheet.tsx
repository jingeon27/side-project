'use client';

import { useId } from 'react';
import { useRouter } from 'next/navigation';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';

import { Button, Input } from '@side/design-system';

import { useSession } from '@/features/auth';
import { boardByKind } from '@/features/board';
import { updatePostMutationOptions } from '@/features/post';
import { uploadPostMediaMutationOptions } from '@/features/post-media';
import type { Post } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { useZodForm } from '@/shared/model/form';
import { BottomSheet, ErrorNotice, Field, useNotify, type IOverlayControlProps } from '@/shared/ui';
import {
  focusInvalidPostContent,
  POST_DETAIL_DEFAULTS,
  postComposerSchema,
  PostContentFields,
  postContentInput,
} from '@/widgets/post-composer';

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
  const { session } = useSession();
  const upload = useMutation(uploadPostMediaMutationOptions(session.user?.id));
  const form = useZodForm(postComposerSchema, {
    defaultValues: {
      title: post.title,
      body: post.body,
      document: post.document ?? undefined,
      editorValid: true,
      board: post.board,
      categoryId: post.categoryId,
      coaching: post.coaching ?? POST_DETAIL_DEFAULTS.coaching,
      friendSale: post.friendSale ?? POST_DETAIL_DEFAULTS.friendSale,
      battle: post.battle ?? POST_DETAIL_DEFAULTS.battle,
    },
  });
  const pending = update.isPending || upload.isPending;
  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync({ id: post.id, body: postContentInput(values) });
      onOpenChange(false);
      notify(t('요청을 수정했어요.'));
      router.refresh();
    } catch {
      /* Keep the edited draft and errors. */
    }
  }, focusInvalidPostContent);
  const errorMessage = update.error?.message ?? upload.error?.message;
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      dismissible={!pending}
      title={t(post.board === 'FEEDBACK' ? '피드백 요청 수정' : '게시글 수정')}
      description={t('나누고 싶은 내용을 다듬어주세요.')}
      footer={
        <>
          <Button variant="secondary" type="button" disabled={pending} onClick={() => onOpenChange(false)}>
            {t('취소')}
          </Button>
          <Button
            variant="accent"
            size="lg"
            type="submit"
            form={formId}
            loading={pending}
            icon={<Check aria-hidden />}
          >
            {t('수정 완료')}
          </Button>
        </>
      }
    >
      <form id={formId} className="form-stack" aria-label={t('게시글 수정')} onSubmit={handleSubmit}>
        <Field label={t('분류')}>
          <Input readOnly value={t(boardByKind(post.board)?.name ?? '게시글')} />
        </Field>
        <PostContentFields form={form} disabled={pending} onUploadMedia={upload.mutateAsync} />
        <ErrorNotice message={errorMessage && t(errorMessage)} />
      </form>
    </BottomSheet>
  );
}
