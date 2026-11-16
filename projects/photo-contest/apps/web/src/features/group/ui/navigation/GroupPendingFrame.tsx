'use client';

import { useFragment } from '@apollo/client/react';

import { DiscoverGroupFragmentDoc } from '@/shared/api/generated';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';

import { GroupNavigation } from './GroupNavigation';

export function GroupPendingFrame({
  groupId,
  title,
  backHref,
  showNavigation = true,
}: {
  groupId: string;
  title?: string;
  backHref: string;
  showNavigation?: boolean;
}) {
  const { data, complete } = useFragment({
    fragment: DiscoverGroupFragmentDoc,
    fragmentName: 'DiscoverGroup',
    from: { __typename: 'Group', id: groupId },
  });
  return (
    <div className="flex flex-1 flex-col">
      <TopAppBar title={title ?? (complete ? data.name : '그룹')} backHref={backHref} />
      <div className="flex flex-1 flex-col gap-6 px-4 py-6 tablet:px-8">
        {showNavigation && complete && data.canViewPosts ? <GroupNavigation groupId={groupId} /> : null}
        <div role="status" aria-label="그룹 본문 불러오는 중" className="flex flex-col gap-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </div>
  );
}
