'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button, FormActions } from '@side/design-system';

import {
  deleteAvatarMutationOptions,
  profileOptions,
  updateProfileMutationOptions,
  uploadAvatarMutationOptions,
} from '@/features/user';
import type { PublicProfile } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { useZodForm } from '@/shared/model/form';
import { useUnsavedChanges } from '@/shared/navigation';
import { ErrorNotice, useNotify } from '@/shared/ui';

import { profileEditSchema, type TProfileEditInput } from '../../model/profile-edit.schema';
import { ProfileDetailsEditor } from '../details/ProfileDetailsEditor';
import { ProfilePhotoEditor } from '../photo/ProfilePhotoEditor';

interface IProfileEditFormProps {
  onSaved: () => void;
  profile: PublicProfile;
}

export function ProfileEditForm({ onSaved, profile }: IProfileEditFormProps) {
  const { t } = useI18n();
  const notify = useNotify();
  const client = useQueryClient();
  const current = useQuery({ ...profileOptions(profile.author.id), initialData: profile });
  const update = useMutation(updateProfileMutationOptions(client));
  const upload = useMutation(uploadAvatarMutationOptions(client));
  const remove = useMutation(deleteAvatarMutationOptions(client));
  const form = useZodForm(profileEditSchema, {
    defaultValues: {
      nickname: profile.author.nickname,
      bio: profile.bio ?? '',
      file: undefined,
      removePhoto: false,
    },
  });
  useUnsavedChanges({
    hasChanges: form.formState.isDirty,
    confirm: () =>
      window.confirm(t('저장하지 않은 변경이 있어요. 이 화면을 나가면 입력한 내용이 사라져요. 계속할까요?')),
    onDiscard: () => {
      update.reset();
      upload.reset();
      remove.reset();
      form.reset();
    },
  });
  const pending = form.formState.isSubmitting || update.isPending || upload.isPending || remove.isPending;
  const error = update.error ?? upload.error ?? remove.error;
  const handleSaved = () => {
    form.reset({ ...form.getValues(), file: undefined, removePhoto: false });
    notify(t('프로필을 수정했어요.'));
    onSaved();
  };
  const handleSaveAvatar = ({ file, removePhoto }: TProfileEditInput) => {
    if (file) {
      upload.mutate(file, { onSuccess: handleSaved });
      return;
    }
    if (removePhoto) {
      remove.mutate(undefined, { onSuccess: handleSaved });
      return;
    }
    handleSaved();
  };
  const handleSubmit = form.handleSubmit((input) => {
    update.reset();
    upload.reset();
    remove.reset();
    if (form.formState.dirtyFields.nickname || form.formState.dirtyFields.bio) {
      update.mutate(
        { nickname: input.nickname, bio: input.bio },
        {
          onSuccess: (saved) => {
            form.resetField('nickname', { defaultValue: saved.author.nickname });
            form.resetField('bio', { defaultValue: saved.bio ?? '' });
            handleSaveAvatar(input);
          },
        },
      );
      return;
    }
    handleSaveAvatar(input);
  });

  return (
    <form
      noValidate
      className="page-form profile-edit-page"
      aria-label={t('프로필 수정')}
      onSubmit={handleSubmit}
    >
      <div data-form-scroll className="page-form-scroll">
        <div className="form-stack">
          <ProfilePhotoEditor form={form} author={current.data.author} disabled={pending} />
          <ProfileDetailsEditor form={form} disabled={pending} />
          <ErrorNotice message={error && t(error.message)} />
        </div>
      </div>
      <FormActions className="px-0" contentClassName="max-w-none">
        <Button
          type="submit"
          className="w-full"
          size="lg"
          disabled={!form.formState.isDirty}
          loading={pending}
        >
          {t('프로필 저장')}
        </Button>
      </FormActions>
    </form>
  );
}
