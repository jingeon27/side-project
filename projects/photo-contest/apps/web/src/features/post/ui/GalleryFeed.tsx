'use client';

import { useApolloClient } from '@apollo/client/react';
import type { ReactNode } from 'react';

import { GalleryPostsDocument } from '@/shared/api/generated';
import { PullToRefresh } from '@/shared/ui/@core/pull-to-refresh';

import { GalleryBoard } from './GalleryBoard';

export function GalleryFeed({
  groupId,
  categoryId,
  sidebar,
  emptyAction,
}: {
  groupId?: string;
  categoryId?: string;
  sidebar?: ReactNode;
  emptyAction?: ReactNode;
}) {
  const client = useApolloClient();
  return (
    <PullToRefresh onRefresh={() => client.refetchQueries({ include: [GalleryPostsDocument] })}>
      <div className="mx-auto grid w-full max-w-5xl items-start gap-8 desktop:grid-cols-[minmax(0,1fr)_240px] desktop:gap-6 wide:grid-cols-[minmax(0,1fr)_280px] wide:gap-8">
        <div className="order-2 mx-auto w-full min-w-0 max-w-app desktop:order-1 desktop:max-w-feed">
          <GalleryBoard groupId={groupId} categoryId={categoryId} emptyAction={emptyAction} />
        </div>
        <div className="contents desktop:sticky desktop:top-24 desktop:order-2 desktop:block desktop:max-h-[calc(100dvh-112px)] desktop:min-w-0 desktop:overflow-y-auto desktop:overscroll-contain">
          <aside className="order-1 mx-auto w-full min-w-0 max-w-app border-b border-line pb-5 desktop:max-w-none desktop:rounded-card desktop:border desktop:bg-surface desktop:p-4 wide:p-5">
            <GalleryBoard groupId={groupId} popular />
          </aside>
          {sidebar ? (
            <div className="order-3 mx-auto w-full min-w-0 max-w-app desktop:mt-5 desktop:max-w-none">
              {sidebar}
            </div>
          ) : null}
        </div>
      </div>
    </PullToRefresh>
  );
}
