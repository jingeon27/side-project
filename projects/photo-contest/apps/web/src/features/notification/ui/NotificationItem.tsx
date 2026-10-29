'use client';

import { useFragment } from '@apollo/client/react';
import { match } from 'ts-pattern';

import {
  NotificationCardFragmentDoc,
  NotificationType,
  type NotificationCardFragment,
} from '@/shared/api/generated';
import { formatDateTime } from '@/shared/lib/format.helper';
import { Button } from '@/shared/ui/@core/button';

export function NotificationItem({
  id,
  onOpen,
}: {
  id: string;
  onOpen: (notification: NotificationCardFragment) => void;
}) {
  const { data, complete } = useFragment({
    fragment: NotificationCardFragmentDoc,
    from: { __typename: 'ActivityNotification', id },
  });
  if (!complete) return null;
  const title = match(data.type)
    .with(NotificationType.PostComment, () => '내 게시물에 댓글이 달렸어요')
    .with(NotificationType.CommentReply, () => '내 댓글에 답글이 달렸어요')
    .with(NotificationType.ContestStarted, () => '대회가 시작됐어요')
    .with(NotificationType.ContestEnded, () => '대회가 종료됐어요')
    .with(NotificationType.JoinRequested, () => '새 그룹 가입 신청이 있어요')
    .with(NotificationType.JoinApproved, () => '그룹 가입이 승인됐어요')
    .with(NotificationType.JoinRejected, () => '그룹 가입 신청이 거절됐어요')
    .exhaustive();
  return (
    <Button
      variant="ghost"
      size="md"
      className="h-auto w-full flex-col items-start gap-2 rounded-card border border-line px-4 py-4 text-left whitespace-normal"
      onClick={() => onOpen(data)}
    >
      <span className="flex w-full flex-wrap items-center justify-between gap-2">
        <span className="text-subtitle text-ink">{title}</span>
        {!data.readAt ? <span className="text-caption text-accent-ink">읽지 않음</span> : null}
      </span>
      <span className="text-caption text-muted">{data.groupName}</span>
      {data.actorNickname ? <span className="text-caption text-muted">{data.actorNickname}</span> : null}
      {data.postTitle || data.contestTitle ? (
        <span className="text-body text-ink">{data.postTitle ?? data.contestTitle}</span>
      ) : null}
      <time className="text-micro text-muted" dateTime={data.createdAt}>
        {formatDateTime(data.createdAt)}
      </time>
    </Button>
  );
}
