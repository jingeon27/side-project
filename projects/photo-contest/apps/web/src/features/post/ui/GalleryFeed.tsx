'use client';

import { useApolloClient } from '@apollo/client/react';

import { GalleryPostsDocument } from '@/shared/api/generated';
import { PullToRefresh } from '@/shared/ui/@core/pull-to-refresh';

import { GalleryBoard } from './GalleryBoard';

export function GalleryFeed({ groupId }: { groupId?: string }) {
  const client = useApolloClient();
  return (
    <PullToRefresh onRefresh={() => client.refetchQueries({ include: [GalleryPostsDocument] })}>
      <div className="grid items-start gap-8 desktop:grid-cols-[minmax(0,1fr)_224px]">
        <div className="order-2 mx-auto w-full min-w-0 max-w-app desktop:order-1">
          <GalleryBoard groupId={groupId} />
        </div>
        <aside className="order-1 min-w-0 border-b border-line pb-5 desktop:order-2 desktop:sticky desktop:top-24 desktop:border-0 desktop:pb-0">
          <GalleryBoard groupId={groupId} popular />
          <p className="mt-6 hidden text-caption leading-relaxed text-subtle desktop:block">
            혼자 보기 아까운 순간들.
            <br />
            갤러리의 친구들과 나눠보세요.
          </p>
        </aside>
      </div>
    </PullToRefresh>
  );
}
