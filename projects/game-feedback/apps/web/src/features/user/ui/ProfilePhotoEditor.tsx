'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useWatch } from 'react-hook-form';

import { Button, buttonVariants, cn } from '@side/design-system';

import { useI18n } from '@/shared/i18n';
import { ErrorNotice } from '@/shared/ui';

import { avatarAccept } from '../lib/avatar-file';
import type { TProfilePhotoForm } from '../model/profile-edit.schema';
import { deleteAvatarMutationOptions, uploadAvatarMutationOptions } from '../model/profile.mutation-options';

function PhotoPreview({ file }: { file: File }) {
  const { t } = useI18n();
  // Blob 미리보기는 서버 이미지 최적화 경로로 보낼 수 없다.
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 로컬 Blob 미리보기
    <img
      alt={t('선택한 프로필 사진 미리보기')}
      className="profile-photo-preview"
      ref={(node) => {
        if (!node) return;
        const url = URL.createObjectURL(file);
        node.src = url;
        return () => URL.revokeObjectURL(url);
      }}
    />
  );
}
export function ProfilePhotoEditor({ form, hasPhoto }: { form: TProfilePhotoForm; hasPhoto: boolean }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const upload = useMutation(uploadAvatarMutationOptions(client));
  const remove = useMutation(deleteAvatarMutationOptions(client));
  const file = useWatch({ control: form.control, name: 'file' });
  const pending = upload.isPending || remove.isPending;
  const fileError = form.formState.errors.file?.message;
  const requestError = upload.error ?? remove.error;
  return (
    <form
      aria-label={t('프로필 사진 편집')}
      onSubmit={form.handleSubmit((value) => upload.mutate(value.file, { onSuccess: () => form.reset() }))}
    >
      <Controller
        control={form.control}
        name="file"
        render={({ field }) => (
          <label className="profile-photo-picker">
            {file && <PhotoPreview file={file} />}
            <input
              ref={field.ref}
              className="peer sr-only"
              type="file"
              accept={avatarAccept}
              aria-label={t('프로필 사진 선택')}
              disabled={pending}
              onBlur={() => field.onBlur()}
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) field.onChange(selected);
                event.target.value = '';
              }}
            />
            <span
              className={cn(
                buttonVariants({ variant: 'secondary' }),
                'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-current',
              )}
            >
              {t(file ? '사진 다시 선택' : '프로필 사진 선택')}
            </span>
          </label>
        )}
      />
      <p className="small muted">{t('JPEG, PNG, WebP / 최대 5MB. 사진은 정사각형으로 잘립니다.')}</p>
      <ErrorNotice message={fileError && t(fileError)} />
      <div className="profile-edit-actions">
        {file && (
          <Button type="submit" disabled={pending}>
            {t('사진 저장')}
          </Button>
        )}
        {hasPhoto && (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => remove.mutate()}>
            {t('프로필 사진 삭제')}
          </Button>
        )}
      </div>
      <ErrorNotice message={requestError && t(requestError.message)} />
    </form>
  );
}
