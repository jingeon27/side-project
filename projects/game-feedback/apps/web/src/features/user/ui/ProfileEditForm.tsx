'use client';

import { useRouter } from 'next/navigation';

import { useQuery } from '@tanstack/react-query';

import type { PublicProfile } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { useZodForm } from '@/shared/model/form';
import { useUnsavedChanges } from '@/shared/navigation';
import { Avatar } from '@/shared/ui';

import { profileDetailsSchema, profileLinksSchema, profilePhotoSchema } from '../model/profile-edit.schema';
import { profileOptions } from '../model/user.options';
import { ProfileDetailsEditor } from './ProfileDetailsEditor';
import { ProfileLinksEditor } from './ProfileLinksEditor';
import { ProfilePhotoEditor } from './ProfilePhotoEditor';

interface IProfileEditFormProps {
  /** 정보를 저장했고 저장하지 않은 사진·링크 초안이 없을 때 부른다. */
  onSaved: () => void;
  profile: PublicProfile;
}

/**
 * 정보·사진·링크는 각자 저장한다. 이 폼이 세 영역의 초안을 소유해, 정보를 저장할 때
 * 저장하지 않은 사진·링크 초안이 있으면 화면을 떠나지 않고 초안을 남긴다.
 */
export function ProfileEditForm({ onSaved, profile }: IProfileEditFormProps) {
  const { t } = useI18n();
  const router = useRouter();
  const current = useQuery({ ...profileOptions(profile.author.id), initialData: profile });
  const details = useZodForm(profileDetailsSchema, {
    defaultValues: { nickname: profile.author.nickname, bio: profile.bio ?? '' },
  });
  const links = useZodForm(profileLinksSchema, { defaultValues: { links: current.data.links ?? [] } });
  const photo = useZodForm(profilePhotoSchema, { defaultValues: { file: undefined } });
  const hasOtherDrafts = links.formState.isDirty || photo.formState.isDirty;
  useUnsavedChanges({
    hasChanges: details.formState.isDirty || hasOtherDrafts,
    confirm: () =>
      window.confirm(t('저장하지 않은 변경이 있어요. 이 화면을 나가면 입력한 내용이 사라져요. 계속할까요?')),
    onDiscard: () => {
      // Next가 떠난 화면의 폼 상태를 보관해도 버리기로 한 초안이 다시 나타나지 않게 한다.
      details.reset();
      links.reset();
      photo.reset();
    },
  });

  const handleDetailsSaved = () => {
    if (!hasOtherDrafts) {
      onSaved();
      return;
    }
    // 바뀐 닉네임이 서버가 그린 화면에도 보이도록 현재 경로만 다시 받는다.
    router.refresh();
  };

  return (
    <div className="settings-card profile-edit-page">
      <div className="settings-profile profile-editor-identity">
        <Avatar src={current.data.author.avatarUrl} name={current.data.author.nickname} size="large" />
        <strong>{current.data.author.nickname}</strong>
      </div>
      <ProfileDetailsEditor form={details} onSaved={handleDetailsSaved} />
      <section className="profile-edit-section">
        <h3>{t('프로필 사진')}</h3>
        <ProfilePhotoEditor form={photo} hasPhoto={!!current.data.author.avatarUrl} />
      </section>
      <section className="profile-edit-section">
        <h3>{t('프로필 링크')}</h3>
        <ProfileLinksEditor form={links} />
      </section>
    </div>
  );
}
