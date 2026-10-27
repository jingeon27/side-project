'use client';

import { useState } from 'react';

import { useIsMutating, useQuery } from '@tanstack/react-query';

import { Button } from '@side/design-system';

import type { PublicProfile } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { useZodForm } from '@/shared/model/form';
import { BottomSheet, type IOverlayControlProps } from '@/shared/ui';

import { profileDetailsSchema, profileLinksSchema, profilePhotoSchema } from '../model/profile-edit.schema';
import { profileMutationKey } from '../model/profile.mutation-options';
import { profileOptions } from '../model/user.options';
import { ProfileDetailsEditor } from './ProfileDetailsEditor';
import { ProfileLinksEditor } from './ProfileLinksEditor';
import { ProfilePhotoEditor } from './ProfilePhotoEditor';

interface IProfileEditSheetProps extends IOverlayControlProps {
  profile: PublicProfile;
}

/**
 * 정보·사진·링크는 각자 저장한다. 시트는 세 영역의 초안을 소유해, 저장 중에는 닫지 않고
 * 저장하지 않은 변경이 있으면 닫기 전에 확인한다.
 */
export function ProfileEditSheet({
  open,
  onOpenChange,
  onOpenChangeComplete,
  profile,
}: IProfileEditSheetProps) {
  const { t } = useI18n();
  const current = useQuery({ ...profileOptions(profile.author.id), initialData: profile });
  const details = useZodForm(profileDetailsSchema, {
    defaultValues: { nickname: profile.author.nickname, bio: profile.bio ?? '' },
  });
  const links = useZodForm(profileLinksSchema, { defaultValues: { links: current.data.links ?? [] } });
  const photo = useZodForm(profilePhotoSchema);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const pending = useIsMutating({ mutationKey: profileMutationKey }) > 0;
  const dirty = details.formState.isDirty || links.formState.isDirty || photo.formState.isDirty;

  function handleOpenChange(next: boolean) {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (pending) return;
    if (dirty) {
      setConfirmingClose(true);
      return;
    }
    onOpenChange(false);
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={handleOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      title={t('프로필 수정')}
      dismissible={!pending}
      footer={
        confirmingClose && dirty ? (
          <>
            <p role="alert" className="small">
              {t('저장하지 않은 변경이 있어요. 닫으면 입력한 내용이 사라져요.')}
            </p>
            <Button type="button" variant="secondary" onClick={() => setConfirmingClose(false)}>
              {t('계속 편집')}
            </Button>
            <Button type="button" variant="danger" disabled={pending} onClick={() => onOpenChange(false)}>
              {t('저장하지 않고 닫기')}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => handleOpenChange(false)}
          >
            {t('닫기')}
          </Button>
        )
      }
    >
      <ProfileDetailsEditor form={details} />
      <section className="profile-edit-section">
        <h3>{t('프로필 사진')}</h3>
        <ProfilePhotoEditor form={photo} hasPhoto={!!current.data.author.avatarUrl} />
      </section>
      <section className="profile-edit-section">
        <h3>{t('프로필 링크')}</h3>
        <ProfileLinksEditor form={links} />
      </section>
    </BottomSheet>
  );
}
