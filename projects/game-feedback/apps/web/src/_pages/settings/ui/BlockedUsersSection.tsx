'use client';

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { ShieldBan } from 'lucide-react';

import { Button } from '@side/design-system';

import { blockListOptions, unblockUserMutationOptions, UserBadges } from '@/features/user';
import { useI18n } from '@/shared/i18n';
import { AsyncBoundary, Avatar, ErrorNotice, LoadingState, useNotify } from '@/shared/ui';

/** 인원 수는 목록을 받은 뒤에만 보인다. 받는 중에 0명으로 보이지 않게 한다. */
function BlockedUsersTitle({ count }: { count?: number }) {
  const { t } = useI18n();
  return (
    <div className="section-title-row">
      <h2>
        <ShieldBan size={19} />
        {t('차단한 사용자')}
      </h2>
      {count !== undefined && <span className="small muted">{t('{count}명', { count })}</span>}
    </div>
  );
}

export function BlockedUsersSection({ userId }: { userId: string }) {
  const { t } = useI18n();
  return (
    <section className="settings-card">
      <AsyncBoundary
        title={t('차단한 사용자')}
        resetKey={userId}
        clientOnly
        pendingFallback={
          <>
            <BlockedUsersTitle />
            <LoadingState />
          </>
        }
      >
        <BlockedUserList userId={userId} />
      </AsyncBoundary>
    </section>
  );
}

function BlockedUserList({ userId }: { userId: string }) {
  const client = useQueryClient();
  const notify = useNotify();
  const { t } = useI18n();
  const { data: blocks } = useSuspenseQuery(blockListOptions(userId));
  const unblock = useMutation(unblockUserMutationOptions(client, () => notify(t('차단을 해제했어요.'))));
  return (
    <>
      <BlockedUsersTitle count={blocks.length} />
      <ErrorNotice message={unblock.error && t(unblock.error.message)} />
      {blocks.length === 0 && <p className="muted small">{t('차단한 사용자가 없어요.')}</p>}
      {blocks.map((person) => (
        <div className="blocked-user" key={person.id}>
          <Avatar src={person.avatarUrl} name={person.nickname} size="small" />
          <strong>{person.nickname}</strong>
          <UserBadges author={person} compact />
          <Button
            variant="secondary"
            size="sm"
            type="submit"
            className="button outline small-button"
            disabled={unblock.isPending}
            onClick={() => unblock.mutate({ userId: person.id })}
          >
            {t('차단 해제')}
          </Button>
        </div>
      ))}
    </>
  );
}
