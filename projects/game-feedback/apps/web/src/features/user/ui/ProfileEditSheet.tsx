'use client';

import { useId } from 'react';
import { useRouter } from 'next/navigation';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useWatch } from 'react-hook-form';

import { PROFILE_BIO_MAX_LENGTH, ProfileDetailsInputSchema } from '@game-feedback/contracts';
import { Button, Input, Textarea } from '@side/design-system';

import type { PublicProfile } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { useZodForm } from '@/shared/model/form';
import { BottomSheet, ErrorNotice, Field, useNotify } from '@/shared/ui';

import { updateProfileMutationOptions } from '../model/profile.mutation-options';
import { profileOptions } from '../model/user.options';
import { ProfileLinksEditor } from './ProfileLinksEditor';
import { ProfilePhotoEditor } from './ProfilePhotoEditor';

interface IProfileEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: PublicProfile;
}

export function ProfileEditSheet({ open, onOpenChange, profile }: IProfileEditSheetProps) {
  const { t } = useI18n();
  const router = useRouter();
  const notify = useNotify();
  const formId = useId();
  const form = useZodForm(ProfileDetailsInputSchema, {
    defaultValues: { nickname: profile.author.nickname, bio: profile.bio ?? '' },
  });
  const bio = useWatch({ control: form.control, name: 'bio' });
  const current = useQuery({ ...profileOptions(profile.author.id), initialData: profile });
  const mutation = useMutation(updateProfileMutationOptions(useQueryClient()));
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('프로필 수정')}
      dismissible={!mutation.isPending}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            disabled={mutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('취소')}
          </Button>
          <Button type="submit" form={formId} disabled={!form.formState.isDirty} loading={mutation.isPending}>
            {t('프로필 저장')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="form-stack"
        aria-label={t('프로필 수정')}
        onSubmit={form.handleSubmit((input) =>
          mutation.mutate(input, {
            onSuccess: () => {
              notify(t('프로필을 수정했어요.'));
              onOpenChange(false);
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
        <ErrorNotice message={mutation.error?.message} />
      </form>
      <section className="profile-edit-section">
        <h3>{t('프로필 사진')}</h3>
        <ProfilePhotoEditor hasPhoto={!!current.data.author.avatarUrl} />
      </section>
      <section className="profile-edit-section">
        <h3>{t('프로필 링크')}</h3>
        <ProfileLinksEditor links={current.data.links} />
      </section>
    </BottomSheet>
  );
}
