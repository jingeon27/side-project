'use client';
import { useI18n } from '@/shared/i18n';
import { BadgeCheck } from 'lucide-react';
import type { Author } from '@/shared/api';
interface IUserBadgesProps {
  author: Author;
  compact?: boolean;
  showTag?: boolean;
}
export function UserBadges({ author, compact = false, showTag = true }: IUserBadgesProps) {
  const { t } = useI18n();
  return (
    <span className={`user-badges ${compact ? 'compact' : ''}`}>
      {author.isVerified ? (
        <span
          className="verified-user-badge"
          title={t('운영자가 부여한 서비스 인증 표시입니다. Supercell 계정 소유권 인증을 의미하지 않습니다.')}
        >
          <BadgeCheck size={12} />
          {author.isTestAccount ? t('인증 유저 (테스트)') : t('인증 유저')}
        </span>
      ) : author.isTestAccount ? (
        <span className="test-user-badge">{t('테스트 계정')}</span>
      ) : null}
      {showTag && author.supercellTag && (
        <span
          className="supercell-user-tag"
          title={t('등록한 Supercell 태그입니다. 게임 계정 소유권은 미인증입니다.')}
        >
          {author.supercellTag}
        </span>
      )}
    </span>
  );
}
