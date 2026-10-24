'use client';

import { useRouter } from 'next/navigation';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, LoaderCircle } from 'lucide-react';

import { Button, Input } from '@side/design-system';

import { boardByKind } from '@/features/board';
import { updatePostMutationOptions } from '@/features/post';
import type { Post } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { useZodForm } from '@/shared/model/form';
import { BottomSheet, ErrorNotice, Field, useNotify } from '@/shared/ui';

import { postComposerSchema } from '../model/post-composer.schema';
import { postContentInput } from '../model/post-content-input';
import { usePostMediaUpload } from '../model/use-post-media-upload';
import { PostContentFields } from './PostContentFields';

interface IEditPostSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: Post;
}
export function EditPostSheet({ open, onOpenChange, post }: IEditPostSheetProps) {
  const client = useQueryClient();
  const { t } = useI18n();
  const router = useRouter();
  const notify = useNotify();
  const update = useMutation(updatePostMutationOptions(client));
  const { upload, handleUpload } = usePostMediaUpload();
  const form = useZodForm(postComposerSchema, {
    defaultValues: {
      title: post.title,
      body: post.body,
      document: post.document ?? undefined,
      editorValid: true,
      board: post.board,
      categoryId: post.categoryId,
      coaching: post.coaching ?? { role: 'COACH', pricing: { type: 'HOURLY', amount: null } },
      friendSale: post.friendSale ?? { price: null },
      battle: post.battle ?? { mode: 'DUEL' },
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
  });
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      dismissible={!pending}
      title={t(post.board === 'FEEDBACK' ? '피드백 요청 수정' : '게시글 수정')}
      description={t('나누고 싶은 내용을 다듬어주세요.')}
    >
      <form className="form-stack" aria-label={t('게시글 수정')} onSubmit={handleSubmit}>
        <input type="hidden" {...form.register('board')} />
        <input type="hidden" {...form.register('categoryId')} />
        <Field label={t('분류')}>
          <Input readOnly value={t(boardByKind(post.board)?.name ?? '게시글')} />
        </Field>
        <Field label={t('게임')}>
          <Input readOnly value={post.category.name} aria-label={t('선택한 게임')} />
        </Field>
        <PostContentFields form={form} disabled={pending} onUploadMedia={handleUpload} />
        <ErrorNotice message={update.error?.message ?? upload.error?.message} />
        <Button variant="accent" size="lg" fullWidth type="submit" disabled={pending}>
          {pending ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}
          {t('수정 완료')}
        </Button>
      </form>
    </BottomSheet>
  );
}
