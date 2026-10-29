import type { ReactNode } from 'react';

import { Camera } from 'lucide-react';

import { EmptyState } from '@/shared/ui/@core/empty-state';

/** 게시물이 하나도 없는 피드의 안내. 글쓰기 같은 다음 행동은 action으로 넣는다. */
export function PostsEmptyState({
  title = '첫 사진을 올려보세요',
  action,
}: {
  title?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <EmptyState
        icon={<Camera className="size-6" />}
        title={title}
        description="사진이나 동영상, 링크로 웃긴 순간을 나눠보세요. 합성한 이미지도 올릴 수 있어요."
      />
      {action}
    </div>
  );
}
