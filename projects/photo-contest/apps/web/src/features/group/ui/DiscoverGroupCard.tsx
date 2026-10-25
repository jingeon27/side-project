'use client';

import Link from 'next/link';

import { useFragment, useQuery } from '@apollo/client/react';
import { ArrowUpRight, Users } from 'lucide-react';

import { useLoginPrompt } from '@/features/auth';
import { DiscoverGroupFragmentDoc, GroupVisibility, MeDocument } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { cn } from '@/shared/lib/cn.helper';
import { formatCount } from '@/shared/lib/format.helper';
import { Avatar } from '@/shared/ui/@core/avatar';

import { GroupMembershipButton } from './GroupMembershipButton';
import { GroupVisibilityBadge } from './GroupVisibilityBadge';

export function DiscoverGroupCard({ id, joinable = false }: { id: string; joinable?: boolean }) {
  const promptLogin = useLoginPrompt();
  const { data: viewer } = useQuery(MeDocument, { fetchPolicy: 'cache-only' });
  const { data: group, complete } = useFragment({
    fragment: DiscoverGroupFragmentDoc,
    fragmentName: 'DiscoverGroup',
    from: { __typename: 'Group', id },
  });
  if (!complete) return null;
  const privateGroup = group.visibility === GroupVisibility.Private;
  return (
    <article className="group flex min-w-0 flex-col gap-4 overflow-hidden rounded-sheet border border-line bg-surface p-5 shadow-card transition-[border-color,box-shadow] hover:border-accent/60 hover:shadow-app">
      <div
        className={cn(
          '-mx-5 -mt-5 flex items-center justify-between gap-3 p-5',
          privateGroup ? 'bg-info-soft' : 'bg-accent-soft',
        )}
      >
        <Avatar
          name={group.name}
          src={group.avatarUrl}
          size="lg"
          className="size-16 -rotate-3 rounded-card border-4 border-surface bg-surface text-ink shadow-card transition-transform group-hover:rotate-0"
        />
        <GroupVisibilityBadge visibility={group.visibility} />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="wrap-anywhere text-title text-ink">
          <Link
            className="inline-flex min-h-touch max-w-full items-center transition-colors hover:text-accent-ink active:opacity-60"
            href={ROUTES.GROUP(id)}
            onClick={(event) => {
              if (!privateGroup || !viewer?.me?.isAnonymous) return;
              event.preventDefault();
              promptLogin(ROUTES.GROUP(id));
            }}
          >
            {group.name}
          </Link>
        </h3>
        <p className="mt-1 line-clamp-3 wrap-anywhere text-body text-muted">
          {group.description ||
            (privateGroup
              ? '그룹장의 수락 후 함께 나눌 수 있어요.'
              : '사진·동영상·합성, 누구나 구경할 수 있어요.')}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-caption">
        <span className="flex items-center gap-1.5 text-muted">
          <Users aria-hidden className="size-4" />
          멤버 {formatCount(group.memberCount)}명
        </span>
        <span className="flex items-center gap-1 text-label text-accent-ink">
          {group.role ? '가입한 그룹' : group.joinRequestPending ? '승인 대기 중' : '둘러보기'}
          <ArrowUpRight aria-hidden className="size-4" />
        </span>
      </div>
      {joinable ? <GroupMembershipButton groupId={id} /> : null}
    </article>
  );
}
