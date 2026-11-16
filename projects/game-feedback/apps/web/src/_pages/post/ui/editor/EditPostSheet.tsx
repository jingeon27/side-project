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
import { useUnsavedChanges } from '@/shared/navigation';
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
  // 버리기로 한 초안을 기준값으로 삼아 닫히는 동안 이탈 확인과 새로고침 경고를 바로 푼다.
  const discard = () => {
    form.reset(form.getValues());
    onOpenChange(false);
  };
  // 취소 버튼과 앱 back은 화면을 떠나지 않고 시트만 닫으므로 같은 문구로 묻는다.
  const confirmClose = () => window.confirm(t('저장하지 않은 변경이 있어요. 닫으면 입력한 내용이 사라져요.'));
  useUnsavedChanges({
    hasChanges: form.formState.isDirty,
    confirm: () =>
      window.confirm(t('저장하지 않은 변경이 있어요. 이 화면을 나가면 입력한 내용이 사라져요. 계속할까요?')),
    confirmClose,
    // 시트는 화면을 옮겨도 남으므로 이탈을 확인하면 고친 내용과 함께 닫는다.
    onDiscard: discard,
  });
  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync({ id: post.id, body: postContentInput(values) });
      // 저장한 내용을 기준값으로 삼아 닫히는 동안 이탈 확인이 다시 뜨지 않게 한다.
      form.reset(form.getValues());
      onOpenChange(false);
      notify(t('요청을 수정했어요.'));
      router.refresh();
    } catch {
      /* Keep the edited draft and errors. */
    }
  }, focusInvalidPostContent);
  const handleCancel = () => {
    if (form.formState.isDirty && !confirmClose()) return;
    discard();
  };
  const errorMessage = update.error?.message ?? upload.error?.message;
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      // 고친 내용이 있으면 쓸어내리기·바깥 누르기·Escape로 닫지 않고, 확인을 거치는 취소 버튼으로만 닫는다.
      dismissible={!pending && !form.formState.isDirty}
      title={t(post.board === 'FEEDBACK' ? '피드백 요청 수정' : '게시글 수정')}
      description={t('나누고 싶은 내용을 다듬어주세요.')}
      footer={
        <>
          <Button variant="secondary" type="button" disabled={pending} onClick={handleCancel}>
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
