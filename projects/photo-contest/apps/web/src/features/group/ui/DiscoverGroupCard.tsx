'use client';

import Link from 'next/link';

import { useFragment } from '@apollo/client/react';
import { ArrowUpRight, Users } from 'lucide-react';

import { DiscoverGroupFragmentDoc, GroupVisibility } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { formatCount } from '@/shared/lib/format.helper';

import { GroupMembershipButton } from './GroupMembershipButton';
import { GroupVisibilityBadge } from './GroupVisibilityBadge';

export function DiscoverGroupCard({ id, joinable = false }: { id: string; joinable?: boolean }) {
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
        <span
          aria-hidden
          className="flex size-14 items-center justify-center rounded-control bg-sunken text-title-lg text-ink"
        >
          {Array.from(group.name.trim())[0] ?? '?'}
        </span>
        <GroupVisibilityBadge visibility={group.visibility} />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="wrap-break-word text-title text-ink">
          <Link className="inline-flex min-h-touch items-center hover:underline" href={ROUTES.GROUP(id)}>
            {group.name}
          </Link>
        </h3>
        <p className="mt-2 text-caption text-muted">
          {privateGroup
            ? '그룹장의 수락 후 함께 나눌 수 있어요.'
            : '사진·동영상·합성, 누구나 구경할 수 있어요.'}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line pt-4 text-caption">
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
