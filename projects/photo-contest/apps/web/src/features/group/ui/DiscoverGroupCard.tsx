'use client';

import Link from 'next/link';

import { useFragment, useQuery } from '@apollo/client/react';
import { ArrowRight, Users } from 'lucide-react';

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
    <article className="flex min-w-0 flex-col rounded-card border border-line bg-surface transition-colors hover:border-line-strong">
      <Link
        href={ROUTES.GROUP(id)}
        aria-label={group.name}
        className="flex min-w-0 flex-1 flex-col gap-3 rounded-card p-4 transition-colors hover:bg-sunken active:bg-neutral-soft"
        onClick={(event) => {
          if (!privateGroup || !viewer?.me?.isAnonymous) return;
          event.preventDefault();
          promptLogin(ROUTES.GROUP(id));
        }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <Avatar
            name={group.name}
            src={group.avatarUrl}
            size="lg"
            className="size-12 rounded-card border border-line bg-sunken text-ink"
          />
          <h3 className="min-w-0 flex-1 wrap-anywhere text-subtitle font-bold text-ink">{group.name}</h3>
          <GroupVisibilityBadge visibility={group.visibility} />
        </div>
        <p className="line-clamp-2 flex-1 wrap-anywhere text-caption text-muted">
          {group.description ||
            (privateGroup
              ? '그룹장의 수락 후 함께 나눌 수 있어요.'
              : '사진·동영상·합성, 누구나 구경할 수 있어요.')}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-caption">
          <span className="flex items-center gap-1.5 text-muted">
            <Users aria-hidden className="size-3.5" />
            멤버 {formatCount(group.memberCount)}명
          </span>
          <span className="flex items-center gap-1.5 text-label text-ink">
            {group.role ? '그룹으로 가기' : group.joinRequestPending ? '신청 상태 보기' : '둘러보기'}
            <ArrowRight aria-hidden className="size-3.5" />
          </span>
        </div>
      </Link>
      {joinable && !group.role ? (
        <div className="flex justify-end border-t border-line px-4 py-3">
          <GroupMembershipButton groupId={id} />
        </div>
      ) : null}
    </article>
  );
}
