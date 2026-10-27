'use client';

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { BellOff, BellRing, UserCheck, UserPlus } from 'lucide-react';

import { Button } from '@side/design-system';

import { useI18n } from '@/shared/i18n';
import { AsyncBoundary, ErrorNotice } from '@/shared/ui';

import { updateFollowMutationOptions } from '../model/follow.mutation-options';
import { followStatusOptions } from '../model/follow.options';

interface IFollowControlsProps {
  userId: string;
  viewerId?: string;
  onLogin: () => void;
}

export function FollowControls({ userId, viewerId, onLogin }: IFollowControlsProps) {
  const { t } = useI18n();
  if (userId === viewerId) return null;
  if (!viewerId)
    return (
      <Button type="button" variant="secondary" size="md" className="profile-follow-toggle" onClick={onLogin}>
        <UserPlus size={16} aria-hidden />
        {t('팔로우')}
      </Button>
    );
  return (
    <AsyncBoundary clientOnly title={t('팔로우 설정')} resetKey={`${viewerId}:${userId}`}>
      <FollowControlContent userId={userId} viewerId={viewerId} />
    </AsyncBoundary>
  );
}

function FollowControlContent({ userId, viewerId }: { userId: string; viewerId: string }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const query = useSuspenseQuery(followStatusOptions(viewerId, userId));
  const mutation = useMutation(updateFollowMutationOptions(client, viewerId));
  const { following, notifyNewPosts } = query.data;
  if (query.error && !query.isFetching) throw query.error;
  return (
    <>
      <Button
        type="button"
        variant={following ? 'secondary' : 'primary'}
        size="md"
        className="profile-follow-toggle"
        disabled={mutation.isPending}
        aria-pressed={following}
        onClick={() => mutation.mutate({ userId, following: !following, notifyNewPosts: !following })}
      >
        {following ? <UserCheck size={16} aria-hidden /> : <UserPlus size={16} aria-hidden />}
        {t(following ? '팔로잉' : '팔로우')}
      </Button>
      {following && (
        <Button
          type="button"
          variant="ghost"
          size="md"
          className="profile-follow-notifications"
          disabled={mutation.isPending}
          aria-pressed={notifyNewPosts}
          onClick={() => mutation.mutate({ userId, following: true, notifyNewPosts: !notifyNewPosts })}
        >
          {notifyNewPosts ? <BellRing size={16} aria-hidden /> : <BellOff size={16} aria-hidden />}
          {t(notifyNewPosts ? '새 글 알림 켜짐' : '새 글 알림 꺼짐')}
        </Button>
      )}
      <ErrorNotice message={mutation.error?.message} />
    </>
  );
}
