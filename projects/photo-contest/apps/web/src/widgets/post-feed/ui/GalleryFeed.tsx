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
      <div className="mx-auto grid w-full max-w-6xl items-start gap-8 desktop:grid-cols-[minmax(0,1fr)_280px] desktop:gap-6 wide:grid-cols-[minmax(0,1fr)_300px] wide:gap-8">
        {/* 데스크톱에서는 피드를 열의 왼쪽에 붙여 화면 제목·탭과 같은 시작선에서 읽게 한다. */}
        <div className="order-2 mx-auto w-full min-w-0 max-w-app desktop:order-1 desktop:mx-0 desktop:max-w-feed">
          {latest}
        </div>
        <div className="contents desktop:sticky desktop:top-24 desktop:order-2 desktop:block desktop:max-h-[calc(100dvh-112px)] desktop:min-w-0 desktop:overflow-y-auto desktop:overscroll-contain">
          {/* 인기 목록이 이름 있는 영역(section)을 가지므로 이름 없는 보조 영역(aside)으로 다시 감싸지 않는다. */}
          <div className="order-1 mx-auto w-full min-w-0 max-w-app desktop:max-w-none desktop:rounded-sheet desktop:bg-surface desktop:p-5 desktop:shadow-card">
            {popular}
          </div>
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
