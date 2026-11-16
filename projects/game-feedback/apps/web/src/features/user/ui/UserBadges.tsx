'use client';

import { BadgeCheck } from 'lucide-react';

import { Badge } from '@side/design-system';

import type { Author } from '@/shared/api';
import { useI18n } from '@/shared/i18n';

interface IUserBadgesProps {
  author: Author;
  compact?: boolean;
  showTag?: boolean;
}
export function UserBadges({ author, compact = false, showTag = true }: IUserBadgesProps) {
  const { t } = useI18n();
  if (!author.isVerified && !(showTag && author.supercellTag)) return null;
  return (
    <span className="user-badges" data-compact={compact || undefined}>
      {author.isVerified && (
        <Badge
          tone="accent"
          title={t('운영자가 부여한 서비스 인증 표시입니다. Supercell 계정 소유권 인증을 의미하지 않습니다.')}
        >
          <BadgeCheck size={12} aria-hidden />
          {t('인증 유저')}
        </Badge>
      )}
      {showTag && author.supercellTag && (
        <Badge tone="neutral" title={t('등록한 Supercell 태그입니다. 게임 계정 소유권은 미인증입니다.')}>
          {author.supercellTag}
        </Badge>
      )}
    </span>
  );
}
