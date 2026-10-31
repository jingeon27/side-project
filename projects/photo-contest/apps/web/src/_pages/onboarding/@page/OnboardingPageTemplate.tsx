'use client';

import { useId } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { useBackgroundQuery, useMutation, useReadQuery, type QueryRef } from '@apollo/client/react';

import { LoginPanel } from '@/features/auth';
import { onboardingSchema, profileSchema } from '@/features/profile';
import {
  CompleteOnboardingDocument,
  CompleteProfileAvatarUploadDocument,
  MeDocument,
  RequestProfileAvatarUploadDocument,
  type MeQuery,
} from '@/shared/api/generated';
import { StorageUploadError, uploadWithTicket } from '@/shared/api/upload-to-storage.helper';
import { ROUTES } from '@/shared/constants/routes';
import { getSafeNextPath } from '@/shared/lib/auth-gate.helper';
import { navigateDocument } from '@/shared/lib/document-navigation.helper';
import { useZodForm } from '@/shared/model/form';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Button } from '@/shared/ui/@core/button';
import { ImageFileField } from '@/shared/ui/@core/image-file-field';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { StickyCta } from '@/shared/ui/@core/sticky-cta';
import { TextField } from '@/shared/ui/@core/text-field';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';

function OnboardingForm({ queryRef }: { queryRef: QueryRef<MeQuery> }) {
  const { data } = useReadQuery(queryRef);
  const search = useSearchParams();
  const errorId = useId();
  const nextPath = getSafeNextPath(search.get('next'));
  const form = useZodForm(onboardingSchema, {
    defaultValues: {
      nickname: data.me?.nickname ?? '',
      avatar: null,
      removeAvatar: false,
      acceptedTerms: false,
    },
  });
  const [requestUpload] = useMutation(RequestProfileAvatarUploadDocument, { fetchPolicy: 'no-cache' });
  const [completeUpload] = useMutation(CompleteProfileAvatarUploadDocument);
  const [finish] = useMutation(CompleteOnboardingDocument);
  if (!data.me) return <LoginPanel nextPath={ROUTES.ONBOARDING} />;
  if (!data.me.needsOnboarding)
    return (
      <div className="flex flex-col gap-4">
        <p>이미 가입을 완료했어요.</p>
        <Button render={<Link href={nextPath} />}>계속하기</Button>
      </div>
    );
  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={form.handleSubmit(async ({ avatar, ...values }) => {
        try {
          const avatarId = avatar
            ? await uploadWithTicket(avatar, {
                request: async () =>
                  (await requestUpload({ variables: { contentType: avatar.type, byteSize: avatar.size } }))
                    .data?.requestProfileAvatarUpload,
                complete: async (uploadId) =>
                  (await completeUpload({ variables: { uploadId } })).data?.completeProfileAvatarUpload.id,
              })
            : undefined;
          await finish({ variables: { ...values, avatarId } });
          navigateDocument(nextPath);
        } catch (error) {
          if (error instanceof StorageUploadError) form.setError('avatar', { message: error.message });
        }
      })}
    >
      <div
        data-form-scroll
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-8 scroll-py-6 tablet:px-8"
      >
        <div className="mx-auto flex w-full max-w-app flex-col gap-6">
          <div>
            <h2 className="text-title-lg text-ink">반가워요! 프로필을 확인해 주세요.</h2>
            <p className="mt-2 text-body text-muted">
              가입을 마치기 전에 닉네임과 프로필 사진을 확인해 주세요.
            </p>
          </div>
          <ImageFileField
            control={form.control}
            trigger={form.trigger}
            name="avatar"
            removeName="removeAvatar"
            label="프로필 사진"
            currentUrl={data.me.avatar}
            fileSchema={profileSchema.shape.avatar}
          />
          <TextField
            label="닉네임"
            required
            maxLength={24}
            autoComplete="nickname"
            disabled={form.formState.isSubmitting}
            error={form.formState.errors.nickname?.message}
            {...form.register('nickname')}
          />
          <div>
            <label className="flex min-h-touch items-center gap-3 text-body text-ink">
              <input
                type="checkbox"
                required
                disabled={form.formState.isSubmitting}
                aria-invalid={Boolean(form.formState.errors.acceptedTerms)}
                aria-describedby={form.formState.errors.acceptedTerms ? errorId : undefined}
                {...form.register('acceptedTerms')}
              />
              이용약관과 개인정보 처리방침에 동의합니다. (필수)
            </label>
            <div className="ml-7 flex gap-4 text-caption text-muted">
              <Link href={ROUTES.TERMS} target="_blank" className="min-h-touch content-center underline">
                이용약관 보기
              </Link>
              <Link href={ROUTES.PRIVACY} target="_blank" className="min-h-touch content-center underline">
                개인정보 처리방침 보기
              </Link>
            </div>
            {form.formState.errors.acceptedTerms ? (
              <p id={errorId} role="alert" className="text-caption text-danger">
                {form.formState.errors.acceptedTerms.message}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <StickyCta className="tablet:px-8">
        <Button type="submit" size="lg" fullWidth loading={form.formState.isSubmitting}>
          동의하고 가입 완료
        </Button>
      </StickyCta>
    </form>
  );
}

export function OnboardingPageTemplate() {
  const [queryRef, { refetch }] = useBackgroundQuery(MeDocument, { fetchPolicy: 'network-only' });
  return (
    <div data-page-form className="flex min-h-0 flex-col">
      <TopAppBar title="가입 설정" />
      <AsyncBoundary onRetry={refetch} fallback={<Skeleton className="h-96 w-full" />}>
        <OnboardingForm queryRef={queryRef} />
      </AsyncBoundary>
    </div>
  );
}
