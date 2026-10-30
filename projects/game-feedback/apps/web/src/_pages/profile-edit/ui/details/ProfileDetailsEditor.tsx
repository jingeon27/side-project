'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWatch } from 'react-hook-form';

import { PROFILE_BIO_MAX_LENGTH } from '@game-feedback/contracts';
import { Button, Input, Textarea } from '@side/design-system';

import { nicknameLength, updateProfileMutationOptions } from '@/features/user';
import { useI18n } from '@/shared/i18n';
import { ErrorNotice, Field, useNotify } from '@/shared/ui';

import type { TProfileDetailsForm } from '../../model/profile-edit.schema';

interface IProfileDetailsEditorProps {
  form: TProfileDetailsForm;
  onSaved: () => void;
}

export function ProfileDetailsEditor({ form, onSaved }: IProfileDetailsEditorProps) {
  const { t } = useI18n();
  const notify = useNotify();
  const mutation = useMutation(updateProfileMutationOptions(useQueryClient()));
  const bio = useWatch({ control: form.control, name: 'bio' });
  return (
    <form
      noValidate
      className="form-stack"
      aria-label={t('프로필 수정')}
      onSubmit={form.handleSubmit((input) =>
        mutation.mutate(input, {
          onSuccess: (profile) => {
            // 저장한 값을 새 기준으로 삼아 이 영역에 저장하지 않은 변경이 남지 않게 한다.
            form.reset({ nickname: profile.author.nickname, bio: profile.bio ?? '' });
            notify(t('프로필을 수정했어요.'));
            onSaved();
          },
        }),
      )}
    >
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
          disabled={mutation.isPending}
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
        <Textarea
          {...form.register('bio')}
          rows={5}
          maxLength={PROFILE_BIO_MAX_LENGTH}
          disabled={mutation.isPending}
        />
      </Field>
      <p className="small muted profile-bio-count">
        {(bio ?? '').length}/{PROFILE_BIO_MAX_LENGTH}
      </p>
      <Button type="submit" disabled={!form.formState.isDirty} loading={mutation.isPending}>
        {t('프로필 저장')}
      </Button>
      <ErrorNotice message={mutation.error && t(mutation.error.message)} />
    </form>
  );
}
