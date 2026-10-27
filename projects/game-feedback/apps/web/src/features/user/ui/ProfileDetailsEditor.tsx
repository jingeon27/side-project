'use client';

import { useRouter } from 'next/navigation';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWatch } from 'react-hook-form';

import { PROFILE_BIO_MAX_LENGTH } from '@game-feedback/contracts';
import { Button, Input, Textarea } from '@side/design-system';

import { useI18n } from '@/shared/i18n';
import { ErrorNotice, Field, useNotify } from '@/shared/ui';

import type { TProfileDetailsForm } from '../model/profile-edit.schema';
import { updateProfileMutationOptions } from '../model/profile.mutation-options';

export function ProfileDetailsEditor({ form }: { form: TProfileDetailsForm }) {
  const { t } = useI18n();
  const router = useRouter();
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
            // 저장한 값이 새 기준이 되어 시트를 닫을 때 저장하지 않은 변경으로 보지 않는다.
            form.reset({ nickname: profile.author.nickname, bio: profile.bio ?? '' });
            notify(t('프로필을 수정했어요.'));
            router.refresh();
          },
        }),
      )}
    >
      <Field
        label={t('서비스 닉네임')}
        hint={t('2~24자의 문자, 숫자, 공백과 _ . -를 사용할 수 있어요.')}
        error={
          form.formState.errors.nickname
            ? t('닉네임은 2~24자의 문자, 숫자, 공백과 _ . -로 입력해주세요.')
            : undefined
        }
      >
        <Input
          {...form.register('nickname')}
          minLength={2}
          maxLength={24}
          required
          autoComplete="nickname"
          disabled={mutation.isPending}
        />
      </Field>
      <Field
        label={t('자기소개')}
        hint={t('웹 주소를 입력하면 프로필에서 클릭 가능한 링크로 표시돼요.')}
        error={form.formState.errors.bio ? t('자기소개는 500자 이하로 입력해주세요.') : undefined}
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
      <ErrorNotice message={mutation.error && t(mutation.error.message)} />
      <div className="profile-edit-actions">
        <Button type="submit" disabled={!form.formState.isDirty} loading={mutation.isPending}>
          {t('프로필 저장')}
        </Button>
      </div>
    </form>
  );
}
