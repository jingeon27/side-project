'use client';
import { useI18n } from '@/shared/i18n';
import Image from 'next/image';
import { Trophy, ShieldAlert, Crown } from 'lucide-react';
import type { GameProfile } from '@/shared/api';
interface IDeckProps {
  profile: GameProfile;
  compact?: boolean;
}
interface IProfileSnapshotProps {
  profile: GameProfile;
}
const cardSymbols = ['⚔️', '🏹', '🔥', '🪵', '💀', '🛡️', '⚡', '❄️'];
export function Deck({ profile, compact = false }: IDeckProps) {
  const { t } = useI18n();
  return (
    <div className={`deck ${compact ? 'deck-compact' : ''}`} aria-label={`${profile.name}님의 요청 시점 덱`}>
      {profile.deck.slice(0, 8).map((card, i) => (
        <div
          className={`deck-card deck-card-${i % 4}`}
          key={card.id}
          title={`${card.name}, ${t('레벨 {level}', { level: card.level })}`}
        >
          {card.iconUrl ? (
            <Image src={card.iconUrl} alt={card.name} width={64} height={80} unoptimized />
          ) : (
            <span aria-hidden="true">{cardSymbols[i] ?? '⚔️'}</span>
          )}
          {!compact && <small>{card.name}</small>}
          <b>{card.level}</b>
        </div>
      ))}
    </div>
  );
}
export function ProfileSnapshot({ profile }: IProfileSnapshotProps) {
  const { t } = useI18n();
  return (
    <section className="snapshot">
      <div className="snapshot-heading">
        <span className="snapshot-icon">
          <Crown size={21} />
        </span>
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
      <Deck profile={profile} />
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
