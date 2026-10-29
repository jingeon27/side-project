'use client';

import type { ReactNode } from 'react';

import { useApolloClient } from '@apollo/client/react';

import { GalleryPostsDocument } from '@/shared/api/generated';
import { PullToRefresh } from '@/shared/ui/@core/pull-to-refresh';

/**
 * 최신 게시물·이달의 인기·사이드바 배치. 데스크톱은 가운데 피드와 오른쪽 인기, 모바일은 인기를 피드 위에 둔다.
 * 맨 위에서 당기면 화면의 게시물 목록을 함께 다시 받는다. 어떤 목록을 넣을지는 화면이 정한다.
 */
export function GalleryFeed({
  latest,
  popular,
  sidebar,
}: {
  latest: ReactNode;
  popular: ReactNode;
  sidebar?: ReactNode;
}) {
  const client = useApolloClient();
  return (
    <PullToRefresh onRefresh={() => client.refetchQueries({ include: [GalleryPostsDocument] })}>
      <div className="mx-auto grid w-full max-w-5xl items-start gap-8 desktop:grid-cols-[minmax(0,1fr)_240px] desktop:gap-6 wide:grid-cols-[minmax(0,1fr)_280px] wide:gap-8">
        <div className="order-2 mx-auto w-full min-w-0 max-w-app desktop:order-1 desktop:max-w-feed">
          {latest}
        </div>
        <div className="contents desktop:sticky desktop:top-24 desktop:order-2 desktop:block desktop:max-h-[calc(100dvh-112px)] desktop:min-w-0 desktop:overflow-y-auto desktop:overscroll-contain">
          <aside className="order-1 mx-auto w-full min-w-0 max-w-app border-b border-line pb-5 desktop:max-w-none desktop:rounded-card desktop:border desktop:bg-surface desktop:p-4 wide:p-5">
            {popular}
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
