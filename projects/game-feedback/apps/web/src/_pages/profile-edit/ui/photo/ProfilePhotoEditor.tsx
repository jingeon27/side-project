'use client';

import { Controller, useWatch } from 'react-hook-form';

import { Button, buttonVariants, cn } from '@side/design-system';

import { avatarAccept } from '@/features/user';
import type { PublicProfile } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { Avatar, ErrorNotice } from '@/shared/ui';

import type { TProfileEditForm } from '../../model/profile-edit.schema';

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
export function ProfilePhotoEditor({
  form,
  author,
  disabled,
}: {
  form: TProfileEditForm;
  author: PublicProfile['author'];
  disabled: boolean;
}) {
  const { t } = useI18n();
  const file = useWatch({ control: form.control, name: 'file' });
  const removePhoto = useWatch({ control: form.control, name: 'removePhoto' });
  const fileError = form.formState.errors.file?.message;
  return (
    <section className="profile-photo-section" aria-label={t('프로필 사진')}>
      <h2>{t('프로필 사진')}</h2>
      <Controller
        control={form.control}
        name="file"
        render={({ field }) => (
          <div className="profile-photo-picker">
            {file ? (
              <PhotoPreview file={file} />
            ) : (
              <Avatar src={removePhoto ? null : author.avatarUrl} name={author.nickname} size="large" />
            )}
            <label className="profile-photo-control">
              <input
                ref={field.ref}
                className="peer sr-only"
                type="file"
                accept={avatarAccept}
                aria-label={t('프로필 사진 선택')}
                disabled={disabled}
                onBlur={field.onBlur}
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (selected) {
                    field.onChange(selected);
                    form.setValue('removePhoto', false, { shouldDirty: true });
                  }
                  event.target.value = '';
                }}
              />
              <span
                data-disabled={disabled || undefined}
                className={cn(
                  buttonVariants({ variant: 'secondary', size: 'md' }),
                  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-current',
                )}
              >
                {t(file ? '사진 다시 선택' : '프로필 사진 선택')}
              </span>
            </label>
          </div>
        )}
      />
      <p className="small muted">{t('JPEG, PNG, WebP / 최대 5MB. 사진은 정사각형으로 잘립니다.')}</p>
      <ErrorNotice message={fileError && t(fileError)} />
      {(author.avatarUrl || file) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => {
            form.setValue('file', undefined, { shouldDirty: true, shouldValidate: true });
            form.setValue('removePhoto', !removePhoto && !!author.avatarUrl, { shouldDirty: true });
          }}
        >
          {t(removePhoto ? '삭제 취소' : '프로필 사진 삭제')}
        </Button>
      )}
      {removePhoto && (
        <p className="small muted" role="status">
          {t('저장하면 프로필 사진이 삭제돼요.')}
        </p>
      )}
    </section>
  );
}
