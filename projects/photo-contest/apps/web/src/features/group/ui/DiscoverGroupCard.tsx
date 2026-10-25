'use client';

import Link from 'next/link';

import { useFragment, useQuery } from '@apollo/client/react';
import { ArrowUpRight, Users } from 'lucide-react';

import { useLoginPrompt } from '@/features/auth';
import { DiscoverGroupFragmentDoc, GroupVisibility, MeDocument } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
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
    <article className="group flex min-w-0 flex-col gap-5 rounded-card border border-line bg-surface p-5 transition-colors hover:border-line-strong hover:bg-sunken active:bg-neutral-soft">
      <div className="flex items-center justify-between gap-3">
        <Avatar
          name={group.name}
          src={group.avatarUrl}
          size="lg"
          className="size-14 rounded-control bg-sunken text-ink"
        />
        <GroupVisibilityBadge visibility={group.visibility} />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="wrap-anywhere text-title text-ink">
          <Link
            className="inline-flex min-h-touch max-w-full items-center hover:underline"
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
        <p className="mt-2 line-clamp-3 wrap-anywhere text-caption text-muted">
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
        <span className="flex items-center gap-1 text-ink">
          {group.role ? '가입한 그룹' : group.joinRequestPending ? '승인 대기 중' : '둘러보기'}
          <ArrowUpRight aria-hidden className="size-4" />
        </span>
      </div>
      {joinable ? <GroupMembershipButton groupId={id} /> : null}
    </article>
  );
}
