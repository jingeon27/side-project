'use client';

import { ArrowUpRight, Globe, ShieldAlert, Trophy } from 'lucide-react';

import type { GameProfile } from '@/shared/api';
import { useI18n } from '@/shared/i18n';

import { ClashRoyaleIcon } from './ClashRoyaleIcon';

interface IProfileSnapshotProps {
  profile: GameProfile;
}
export function ProfileSnapshot({ profile }: IProfileSnapshotProps) {
  const { t, locale } = useI18n();
  const formatRank = (rank?: number | null) =>
    rank ? t('{rank}위', { rank: rank.toLocaleString(locale) }) : t('정보 없음');
  return (
    <section className="snapshot">
      <div className="snapshot-heading">
        <ClashRoyaleIcon className="snapshot-icon" size={40} />
        <div className="snapshot-identity">
          <strong>{profile.name}</strong>
          <span>{profile.playerTag}</span>
        </div>
        <a
          className="snapshot-external-link"
          href={`https://royaleapi.com/player/${encodeURIComponent(profile.playerTag.replace(/^#/, ''))}`}
          target="_blank"
          rel="nofollow noopener noreferrer"
          aria-label={t('{name}의 RoyaleAPI 프로필 (새 탭)', { name: profile.name })}
        >
          RoyaleAPI <ArrowUpRight size={14} aria-hidden />
        </a>
      </div>
      <p className="snapshot-arena">{profile.arena}</p>
      <dl className="snapshot-stats">
        <div>
          <dt>
            <Trophy size={14} aria-hidden />
            {t('트로피')}
          </dt>
          <dd>{profile.trophies.toLocaleString(locale)}</dd>
        </div>
        <div>
          <dt>
            <Trophy size={14} aria-hidden />
            {t('최고 트로피')}
          </dt>
          <dd>{profile.bestTrophies.toLocaleString(locale)}</dd>
        </div>
        <div>
          <dt>
            <Globe size={14} aria-hidden />
            {t('현재 세계 순위')}
          </dt>
          <dd className={!profile.currentGlobalRank ? 'snapshot-rank-unavailable' : undefined}>
            {formatRank(profile.currentGlobalRank)}
          </dd>
        </div>
        <div>
          <dt>
            <Globe size={14} aria-hidden />
            {t('최고 시즌 순위')}
          </dt>
          <dd className={!profile.bestGlobalRank ? 'snapshot-rank-unavailable' : undefined}>
            {formatRank(profile.bestGlobalRank)}
          </dd>
        </div>
      </dl>
      <div className="snapshot-foot">
        <ShieldAlert size={14} aria-hidden />
        <p>{t('조회 시점의 게임 정보이며, 계정 소유권 인증과는 별개입니다.')}</p>
      </div>
    </section>
  );
}
