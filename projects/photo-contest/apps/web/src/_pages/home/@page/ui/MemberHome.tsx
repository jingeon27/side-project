'use client';

import { CreatePostButton, GalleryFeed } from '@/features/post';
import { MyGroupsDocument, type MyGroupsQuery } from '@/shared/api/generated';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { useBackgroundQuery, useReadQuery, type QueryRef } from '@apollo/client/react';
import { NoGroupHome } from '../no-group/NoGroupHome';

function MemberHomeContent({
  queryRef,
  feedPreloaded,
}: {
  queryRef: QueryRef<MyGroupsQuery>;
  feedPreloaded: boolean;
}) {
  const { data } = useReadQuery(queryRef);
  if (!data.myGroups.length) return <NoGroupHome signedIn />;
  return (
    <GalleryFeed
      clientOnly={!feedPreloaded}
      emptyAction={
        <div className="flex flex-wrap justify-center gap-3">
          {data.myGroups.map((group) => (
            <div key={group.id} className="flex items-center gap-2">
              <span className="text-caption text-muted">{group.name}</span>
              <CreatePostButton groupId={group.id} />
            </div>
          ))}
        </div>
      }
    />
  );
}
export function MemberHome({ feedPreloaded }: { feedPreloaded: boolean }) {
  const [queryRef, { refetch }] = useBackgroundQuery(MyGroupsDocument);
  return (
    <AsyncBoundary onRetry={refetch} fallback={<Skeleton className="h-48 w-full" />}>
      <MemberHomeContent queryRef={queryRef} feedPreloaded={feedPreloaded} />
    </AsyncBoundary>
  );
}
