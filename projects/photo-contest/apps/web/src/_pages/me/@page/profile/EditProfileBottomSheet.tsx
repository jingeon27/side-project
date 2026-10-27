'use client';

import { useId } from 'react';

import { useBackgroundQuery, useMutation, useReadQuery, type QueryRef } from '@apollo/client/react';

import { ProfileAvatarField, profileSchema } from '@/features/profile';
import {
  CompleteProfileAvatarUploadDocument,
  MeDocument,
  RequestProfileAvatarUploadDocument,
  UpdateMyProfileDocument,
  type MeQuery,
} from '@/shared/api/generated';
import { StorageUploadError, uploadToStorage } from '@/shared/api/upload-to-storage.helper';
import { notifyClosedSubmit, throwIfClosed, useAbortOnClose, useZodForm } from '@/shared/model/form';
import { toast } from '@/shared/model/toast';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { BottomSheet, type IBottomSheetControlProps } from '@/shared/ui/@core/bottom-sheet';
import { Button } from '@/shared/ui/@core/button';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TextField } from '@/shared/ui/@core/text-field';

function ProfileForm({
  queryRef,
  isOpen,
  onClose,
}: {
  queryRef: QueryRef<MeQuery>;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { data } = useReadQuery(queryRef);
  const form = useZodForm(profileSchema, {
    defaultValues: {
      nickname: data.me?.nickname ?? '',
      avatar: null,
      removeAvatar: false,
      acceptedTerms: false,
    },
  });
  const formId = useId();
  const beginSubmit = useAbortOnClose(isOpen);
  const [requestUpload] = useMutation(RequestProfileAvatarUploadDocument, { fetchPolicy: 'no-cache' });
  const [completeUpload] = useMutation(CompleteProfileAvatarUploadDocument);
  const [save] = useMutation(UpdateMyProfileDocument, {
    refetchQueries: [MeDocument],
    awaitRefetchQueries: true,
  });
  if (!data.me) return <BottomSheet.Content>다시 로그인해 주세요.</BottomSheet.Content>;
  return (
    <>
      <BottomSheet.Content className="px-0">
        <form
          id={formId}
          noValidate
          className="mx-auto flex w-full max-w-app flex-col gap-6 py-3"
          onSubmit={form.handleSubmit(async ({ avatar, nickname, removeAvatar }) => {
            const signal = beginSubmit();
            try {
              let avatarId: string | undefined;
              if (avatar) {
                const { data: ticket } = await requestUpload({
                  variables: { contentType: avatar.type, byteSize: avatar.size },
                });
                if (!ticket) return;
                throwIfClosed(signal);
                await uploadToStorage(ticket.requestProfileAvatarUpload, avatar, { signal });
                throwIfClosed(signal);
                const { data: completed } = await completeUpload({
                  variables: { uploadId: ticket.requestProfileAvatarUpload.id },
                });
                if (!completed) return;
                avatarId = completed.completeProfileAvatarUpload.id;
              }
              throwIfClosed(signal);
              await save({ variables: { nickname, removeAvatar, avatarId } });
              toast.success('프로필을 수정했어요');
              onClose();
            } catch (error) {
              if (signal.aborted) {
                notifyClosedSubmit('프로필을 저장하지 않았어요');
                return;
              }
              if (error instanceof StorageUploadError) form.setError('avatar', { message: error.message });
            }
          })}
        >
          <ProfileAvatarField form={form} currentUrl={data.me.avatar} />
          <p className="text-caption text-muted">직접 올린 프로필 사진과 닉네임은 작성자 정보에 표시돼요.</p>
          <TextField
            label="닉네임"
            required
            maxLength={24}
            disabled={form.formState.isSubmitting}
            error={form.formState.errors.nickname?.message}
            {...form.register('nickname')}
          />
        </form>
      </BottomSheet.Content>
      <BottomSheet.Footer className="px-0">
        <div className="mx-auto w-full max-w-app">
          <Button type="submit" form={formId} fullWidth loading={form.formState.isSubmitting}>
            프로필 저장하기
          </Button>
        </div>
      </BottomSheet.Footer>
    </>
  );
}

export function EditProfileBottomSheet(controls: IBottomSheetControlProps) {
  const [queryRef, { refetch }] = useBackgroundQuery(MeDocument, { fetchPolicy: 'network-only' });
  return (
    <BottomSheet.Root {...controls} className="px-5">
      <BottomSheet.Header
        title="프로필 수정"
        description="사진과 닉네임을 원하는 모습으로 바꿔 보세요."
        className="mx-auto w-full max-w-app px-0"
      />
      <AsyncBoundary onRetry={() => refetch()} fallback={<Skeleton className="mx-5 h-64" />}>
        <ProfileForm queryRef={queryRef} isOpen={controls.isOpen} onClose={() => controls.onClose()} />
      </AsyncBoundary>
    </BottomSheet.Root>
  );
}
