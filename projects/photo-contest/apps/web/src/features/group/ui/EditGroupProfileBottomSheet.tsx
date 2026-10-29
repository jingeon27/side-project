'use client';

import { useId } from 'react';

import { useBackgroundQuery, useMutation, useReadQuery, type QueryRef } from '@apollo/client/react';

import {
  CompleteGroupAvatarUploadDocument,
  DiscoverGroupsDocument,
  GalleryDocument,
  GroupProfileDocument,
  MyGroupsDocument,
  RequestGroupAvatarUploadDocument,
  UpdateGroupProfileDocument,
  type GroupProfileQuery,
} from '@/shared/api/generated';
import { StorageUploadError, uploadWithTicket } from '@/shared/api/upload-to-storage.helper';
import { notifyClosedSubmit, throwIfClosed, useAbortOnClose, useZodForm } from '@/shared/model/form';
import { toast } from '@/shared/model/toast';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { BottomSheet, type IBottomSheetControlProps } from '@/shared/ui/@core/bottom-sheet';
import { Button } from '@/shared/ui/@core/button';
import { ImageFileField } from '@/shared/ui/@core/image-file-field';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TextArea, TextField } from '@/shared/ui/@core/text-field';

import { getGroupProfileDefaults, toGroupProfileVariables } from '../model/group-profile-form.helper';
import { groupProfileSchema } from '../model/group-profile.schema';
import { GroupImagePicker } from './GroupImagePicker';

function ProfileForm({
  queryRef,
  isOpen,
  onClose,
}: {
  queryRef: QueryRef<GroupProfileQuery>;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { data } = useReadQuery(queryRef);
  const group = data.group;
  const form = useZodForm(groupProfileSchema, {
    defaultValues: getGroupProfileDefaults(group),
  });
  const formId = useId();
  // 서명된 업로드 정책은 한 번만 쓰는 값이라 정규화 캐시에 남기지 않는다.
  const [requestUpload] = useMutation(RequestGroupAvatarUploadDocument, { fetchPolicy: 'no-cache' });
  const [completeUpload] = useMutation(CompleteGroupAvatarUploadDocument);
  const [save] = useMutation(UpdateGroupProfileDocument, {
    refetchQueries: [
      MyGroupsDocument,
      DiscoverGroupsDocument,
      { query: GalleryDocument, variables: { id: group.id } },
    ],
    awaitRefetchQueries: true,
  });
  const beginSubmit = useAbortOnClose(isOpen);
  const { errors, isSubmitting } = form.formState;
  return (
    <>
      <BottomSheet.Content>
        <form
          id={formId}
          noValidate
          className="mx-auto flex w-full max-w-app flex-col gap-6 py-3"
          onSubmit={form.handleSubmit(async (values) => {
            const { avatar, cover } = values;
            const signal = beginSubmit();
            try {
              const uploadImage = (image: File | null) =>
                image
                  ? uploadWithTicket(image, {
                      signal,
                      request: async () =>
                        (
                          await requestUpload({
                            variables: { groupId: group.id, contentType: image.type, byteSize: image.size },
                          })
                        ).data?.requestGroupAvatarUpload,
                      complete: async (uploadId) =>
                        (await completeUpload({ variables: { uploadId } })).data?.completeGroupAvatarUpload
                          .id,
                    })
                  : Promise.resolve(undefined);
              const [avatarId, coverId] = await Promise.all([uploadImage(avatar), uploadImage(cover)]);
              // 닫힌 시트에서는 저장하지 않는다. 저장 요청을 보낸 뒤에는 결과를 토스트로 알린다.
              throwIfClosed(signal);
              await save({
                variables: toGroupProfileVariables(group.id, values, { avatarId, coverId }),
              });
              toast.success('그룹 프로필을 수정했어요');
              onClose();
            } catch (error) {
              if (signal.aborted) {
                notifyClosedSubmit('그룹 프로필을 저장하지 않았어요');
                return;
              }
              if (error instanceof StorageUploadError) form.setError('avatar', { message: error.message });
            }
          })}
        >
          <GroupImagePicker
            label="그룹 배경 사진"
            cover
            currentUrl={group.coverUrl}
            disabled={isSubmitting}
            error={errors.cover?.message}
            onChange={(file) => {
              form.setValue('cover', file, { shouldValidate: true });
              form.setValue('removeCover', !file);
            }}
          />
          <ImageFileField
            control={form.control}
            trigger={form.trigger}
            name="avatar"
            removeName="removeAvatar"
            label="그룹 사진"
            currentUrl={group.avatarUrl}
            fileSchema={groupProfileSchema.shape.avatar}
          />
          <p className="text-caption text-muted">
            그룹 사진과 소개는 공개 범위와 관계없이 탐색 화면에서도 보여요.
          </p>
          <TextField
            label="그룹 이름"
            required
            maxLength={40}
            disabled={isSubmitting}
            error={errors.name?.message}
            {...form.register('name')}
          />
          <TextArea
            label="그룹 소개"
            rows={4}
            maxLength={500}
            disabled={isSubmitting}
            placeholder="어떤 순간을 함께 나눌까요?"
            error={errors.description?.message}
            {...form.register('description')}
          />
        </form>
      </BottomSheet.Content>
      <BottomSheet.Footer>
        <Button type="submit" form={formId} fullWidth loading={isSubmitting} className="mx-auto max-w-app">
          프로필 저장하기
        </Button>
      </BottomSheet.Footer>
    </>
  );
}

export function EditGroupProfileBottomSheet({
  groupId,
  ...controls
}: IBottomSheetControlProps & { groupId: string }) {
  const [queryRef, { refetch }] = useBackgroundQuery(GroupProfileDocument, {
    variables: { id: groupId },
    fetchPolicy: 'network-only',
  });
  return (
    <BottomSheet.Root {...controls}>
      <BottomSheet.Header title="그룹 프로필 수정" />
      <AsyncBoundary onRetry={refetch} fallback={<Skeleton className="mx-5 h-64" />}>
        <ProfileForm queryRef={queryRef} isOpen={controls.isOpen} onClose={controls.onClose} />
      </AsyncBoundary>
    </BottomSheet.Root>
  );
}
