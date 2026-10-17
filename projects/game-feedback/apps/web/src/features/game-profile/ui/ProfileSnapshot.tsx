'use client';
import { useI18n } from '@/shared/i18n';
import { Trophy, ShieldAlert } from 'lucide-react';
import type { GameProfile } from '@/shared/api';
import { ClashRoyaleIcon } from './ClashRoyaleIcon';
interface IProfileSnapshotProps {
  profile: GameProfile;
}
export function ProfileSnapshot({ profile }: IProfileSnapshotProps) {
  const { t } = useI18n();
  return (
    <section className="snapshot">
      <div className="snapshot-heading">
        <ClashRoyaleIcon className="snapshot-icon" size={34} />
        <div>
          <strong>{profile.name}</strong>
          <span>
            {profile.playerTag} / {profile.arena}
          </span>
        </div>
        <span className="snapshot-trophies">
          <Trophy size={15} />
          {profile.trophies.toLocaleString()}
        </span>
      </div>
      <div className="snapshot-foot">
        <span>
          <ShieldAlert size={13} />
          {t('소유권 미인증. 요청 작성 시점의 프로필입니다.')}
        </span>
        {profile.source === 'DEMO' && <span>{t('데모 프로필')}</span>}
      </div>
    </section>
  );
}
