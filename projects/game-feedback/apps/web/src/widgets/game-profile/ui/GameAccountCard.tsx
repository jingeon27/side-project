'use client';

import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';

import { Button } from '@side/design-system';

import { gameProfileOptions, ProfileSnapshot } from '@/features/game-profile';
import type { GameProfile } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { ErrorNotice } from '@/shared/ui';

export function GameAccountCard({ profile }: { profile: GameProfile }) {
  const { t } = useI18n();
  const latest = useQuery({
    ...gameProfileOptions(profile.playerTag),
    initialData: profile,
    initialDataUpdatedAt: 0,
    retry: false,
  });
  return (
    <div className="game-account-card">
      <ProfileSnapshot profile={latest.data} />
      <div className="game-account-refresh">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={latest.isFetching}
          onClick={() => void latest.refetch()}
          aria-label={t('{name} 게임 정보 새로고침', { name: profile.name })}
        >
          <RefreshCw size={14} aria-hidden className={latest.isFetching ? 'spin' : undefined} />
          {t('새로고침')}
        </Button>
      </div>
      <ErrorNotice message={latest.error && t(latest.error.message)} />
    </div>
  );
}
