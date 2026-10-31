'use client';

import { useMutation, useReadQuery, type QueryRef } from '@apollo/client/react';

import { GroupImagePicker, groupProfileSchema } from '@/features/group';
import {
  CompleteGroupAvatarUploadDocument,
  DiscoverGroupsDocument,
  GalleryDocument,
  MyGroupsDocument,
  RequestGroupAvatarUploadDocument,
  UpdateGroupProfileDocument,
  type GroupProfileQuery,
} from '@/shared/api/generated';
import { StorageUploadError, uploadWithTicket } from '@/shared/api/upload-to-storage.helper';
import { notifyClosedSubmit, throwIfClosed, useAbortOnClose, useZodForm } from '@/shared/model/form';
import { toast } from '@/shared/model/toast';
import { Button } from '@/shared/ui/@core/button';
import { ImageFileField } from '@/shared/ui/@core/image-file-field';
import { StickyCta } from '@/shared/ui/@core/sticky-cta';
import { FieldRequirement, TextArea, TextField } from '@/shared/ui/@core/text-field';

import { getGroupProfileDefaults, toGroupProfileVariables } from '../model/group-profile-form.helper';

export function EditGroupProfileForm({
  queryRef,
  onSaved,
  onCancel,
}: {
  queryRef: QueryRef<GroupProfileQuery>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { data } = useReadQuery(queryRef);
  const group = data.group;
  const form = useZodForm(groupProfileSchema, { defaultValues: getGroupProfileDefaults(group) });
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
  const beginSubmit = useAbortOnClose(true);
  const { errors, isSubmitting } = form.formState;
  return (
    <form
      aria-label="그룹 프로필 수정"
      noValidate
      className="flex min-h-0 min-w-0 flex-1 flex-col"
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
                    (await completeUpload({ variables: { uploadId } })).data?.completeGroupAvatarUpload.id,
                })
              : Promise.resolve(undefined);
          const [avatarId, coverId] = await Promise.all([uploadImage(avatar), uploadImage(cover)]);
          throwIfClosed(signal);
          await save({ variables: toGroupProfileVariables(group.id, values, { avatarId, coverId }) });
          toast.success('그룹 프로필을 수정했어요');
          if (!signal.aborted) onSaved();
        } catch (error) {
          if (signal.aborted) {
            notifyClosedSubmit('그룹 프로필을 저장하지 않았어요');
            return;
          }
          if (error instanceof StorageUploadError) form.setError('root', { message: error.message });
        }
      })}
    >
      <div
        data-form-scroll
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 py-6 scroll-py-6 tablet:px-8"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
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
            rows={3}
            maxLength={500}
            disabled={isSubmitting}
            placeholder="어떤 순간을 함께 나눌까요?"
            error={errors.description?.message}
            {...form.register('description')}
          />
          <p className="text-caption text-muted">
            그룹 사진과 소개는 공개 범위와 관계없이 탐색 화면에서도 보여요.
          </p>
          <details className="border-t border-line pt-3">
            <summary className="min-h-touch cursor-pointer content-center text-label text-ink active:text-muted">
              그룹 사진 변경
              <FieldRequirement />
              {errors.cover || errors.avatar ? (
                <span className="ml-2 text-caption text-danger">선택한 사진을 확인해 주세요</span>
              ) : null}
            </summary>
            <div className="flex flex-col gap-6 pt-4">
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
            </div>
          </details>
          {errors.root?.message ? (
            <p role="alert" className="text-body text-danger">
              {errors.root.message}
            </p>
          ) : null}
        </div>
      </div>
      <StickyCta className="px-5 tablet:px-8" contentClassName="max-w-3xl">
        <div className="flex flex-row gap-3 [&>*]:min-w-0 [&>*]:flex-1">
          <Button type="button" variant="secondary" size="lg" disabled={isSubmitting} onClick={onCancel}>
            취소
          </Button>
          <Button type="submit" size="lg" loading={isSubmitting}>
            프로필 저장하기
          </Button>
        </div>
      </StickyCta>
    </form>
  );
}
