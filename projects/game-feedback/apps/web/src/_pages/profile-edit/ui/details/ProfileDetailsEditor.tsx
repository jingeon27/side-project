'use client';

import { useWatch } from 'react-hook-form';

import { PROFILE_BIO_MAX_LENGTH } from '@game-feedback/contracts';
import { Input, Textarea } from '@side/design-system';

import { nicknameLength } from '@/features/user';
import { useI18n } from '@/shared/i18n';
import { Field } from '@/shared/ui';

import type { TProfileEditForm } from '../../model/profile-edit.schema';

interface IProfileDetailsEditorProps {
  form: TProfileEditForm;
  disabled: boolean;
}

export function ProfileDetailsEditor({ form, disabled }: IProfileDetailsEditorProps) {
  const { t } = useI18n();
  const bio = useWatch({ control: form.control, name: 'bio' });
  return (
    <>
      <Field
        label={t('서비스 닉네임')}
        hint={t('{min}~{max}자의 문자, 숫자, 공백과 _ . -를 사용할 수 있어요.', nicknameLength)}
        error={
          form.formState.errors.nickname
            ? t('닉네임은 {min}~{max}자의 문자, 숫자, 공백과 _ . -로 입력해주세요.', nicknameLength)
            : undefined
        }
      >
        <Input
          {...form.register('nickname')}
          minLength={nicknameLength.min}
          maxLength={nicknameLength.max}
          required
          autoComplete="nickname"
          disabled={disabled}
        />
      </Field>
      <Field
        label={t('자기소개')}
        hint={t('웹 주소를 입력하면 프로필에서 클릭 가능한 링크로 표시돼요.')}
        error={
          form.formState.errors.bio
            ? t('자기소개는 {max}자 이하로 입력해주세요.', { max: PROFILE_BIO_MAX_LENGTH })
            : undefined
        }
      >
        <Textarea {...form.register('bio')} rows={5} maxLength={PROFILE_BIO_MAX_LENGTH} disabled={disabled} />
      </Field>
      <p className="small muted profile-bio-count">
        {(bio ?? '').length}/{PROFILE_BIO_MAX_LENGTH}
      </p>
    </>
  );
}
