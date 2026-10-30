'use client';

import { useMutation } from '@apollo/client/react';

import { GroupImagePicker, prependMyGroup } from '@/features/group';
import {
  CompleteGroupAvatarUploadDocument,
  CreateGroupDocument,
  GroupVisibility,
  MyGroupsDocument,
  RequestGroupAvatarUploadDocument,
  UpdateGroupProfileDocument,
} from '@/shared/api/generated';
import { StorageUploadError, uploadToStorage } from '@/shared/api/upload-to-storage.helper';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { notifyClosedSubmit, throwIfClosed, useAbortOnClose, useZodForm } from '@/shared/model/form';
import { Button } from '@/shared/ui/@core/button';
import { FieldRequirement, TextArea, TextField } from '@/shared/ui/@core/text-field';

import { createGroupSchema } from '../model/group.schema';
import { GroupVisibilityField } from './GroupVisibilityField';

export function CreateGroupForm({
  onCreated,
  onCancel,
}: {
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const form = useZodForm(createGroupSchema, {
    defaultValues: {
      name: '',
      description: '',
      visibility: GroupVisibility.Public,
      avatar: null,
      cover: null,
    },
  });
  // 사진 업로드를 재시도할 때 이미 만든 그룹을 다시 만들지 않는다.
  const [create, { data: created }] = useMutation(CreateGroupDocument, {
    update: (cache, { data }) => {
      if (data) prependMyGroup(cache, data.createGroup);
    },
  });
  const [requestUpload] = useMutation(RequestGroupAvatarUploadDocument, { fetchPolicy: 'no-cache' });
  const [completeUpload] = useMutation(CompleteGroupAvatarUploadDocument);
  const [saveProfile] = useMutation(UpdateGroupProfileDocument, {
    refetchQueries: [MyGroupsDocument],
    awaitRefetchQueries: true,
  });
  const beginSubmit = useAbortOnClose(true);
  const uploadImage = async (groupId: string, image: File | null | undefined, signal: AbortSignal) => {
    if (!image) return undefined;
    const { data: ticket } = await requestUpload({
      variables: { groupId, contentType: image.type, byteSize: image.size },
    });
    if (!ticket) throw new Error('사진 업로드를 시작하지 못했어요.');
    throwIfClosed(signal);
    await uploadToStorage(ticket.requestGroupAvatarUpload, image, { signal });
    throwIfClosed(signal);
    const { data } = await completeUpload({ variables: { uploadId: ticket.requestGroupAvatarUpload.id } });
    if (!data) throw new Error('사진 업로드를 마치지 못했어요.');
    return data.completeGroupAvatarUpload.id;
  };
  return (
    <form
      aria-label="그룹 만들기"
      noValidate
      className="flex min-w-0 flex-col gap-6"
      onSubmit={form.handleSubmit(async ({ name, description, visibility, avatar, cover }) => {
        const signal = beginSubmit();
        try {
          const group =
            created?.createGroup ??
            (await create({ variables: { name, description, visibility } })).data?.createGroup;
          if (!group) return;
          throwIfClosed(signal);
          const [avatarId, coverId] = await Promise.all([
            uploadImage(group.id, avatar, signal),
            uploadImage(group.id, cover, signal),
          ]);
          throwIfClosed(signal);
          if (avatarId || coverId || created?.createGroup)
            await saveProfile({ variables: { groupId: group.id, name, description, avatarId, coverId } });
          trackEvent(ANALYTICS_EVENT.GroupCreated, { group_id: group.id });
          if (!signal.aborted) onCreated(group.id);
        } catch (error) {
          if (signal.aborted) {
            notifyClosedSubmit('그룹 사진을 저장하지 않았어요');
            return;
          }
          if (error instanceof StorageUploadError)
            form.setError('root', { message: '사진을 올리지 못했어요. 다시 시도해 주세요.' });
        }
      })}
    >
      <TextField
        required
        label="그룹 이름"
        maxLength={40}
        placeholder="예: 웃음 참기 연구소"
        error={form.formState.errors.name?.message}
        disabled={form.formState.isSubmitting}
        {...form.register('name')}
      />
      <GroupVisibilityField form={form} disabled={form.formState.isSubmitting || Boolean(created)} />
      <TextArea
        label="그룹 소개"
        maxLength={500}
        rows={3}
        error={form.formState.errors.description?.message}
        disabled={form.formState.isSubmitting}
        {...form.register('description')}
      />
      <details className="border-t border-line pt-3">
        <summary className="min-h-touch cursor-pointer content-center text-label text-ink active:text-muted">
          그룹 사진 추가
          <FieldRequirement />
          {form.formState.errors.cover || form.formState.errors.avatar ? (
            <span className="ml-2 text-caption text-danger">선택한 사진을 확인해 주세요</span>
          ) : null}
        </summary>
        <div className="flex flex-col gap-6 pt-4">
          <GroupImagePicker
            label="그룹 배경 사진"
            cover
            disabled={form.formState.isSubmitting}
            error={form.formState.errors.cover?.message}
            onChange={(file) => form.setValue('cover', file, { shouldValidate: true })}
          />
          <GroupImagePicker
            label="그룹 프로필 사진"
            disabled={form.formState.isSubmitting}
            error={form.formState.errors.avatar?.message}
            onChange={(file) => form.setValue('avatar', file, { shouldValidate: true })}
          />
        </div>
      </details>
      {form.formState.errors.root?.message ? (
        <p role="alert" className="text-body text-danger">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      <div className="flex flex-row gap-3 border-t border-line pt-5 [&>*]:min-w-0 [&>*]:flex-1">
        <Button
          type="button"
          variant="secondary"
          size="lg"
          disabled={form.formState.isSubmitting}
          onClick={onCancel}
        >
          취소
        </Button>
        <Button type="submit" loading={form.formState.isSubmitting}>
          그룹 만들기
        </Button>
      </div>
    </form>
  );
}
