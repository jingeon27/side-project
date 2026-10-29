'use client';

import type { GalleryQuery } from '@/shared/api/generated';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { replaceSearchParams } from '@/shared/model/router';
import { Button } from '@/shared/ui/@core/button';

/** 게시물 카테고리 선택. 고른 값은 주소의 category로 남기고 목록은 화면이 그 값으로 조회한다. */
export function GroupCategoryFilter({
  group,
  categoryId,
}: {
  group: GalleryQuery['group'];
  categoryId: string | null;
}) {
  if (!group.categories.length) return null;
  return (
    <nav aria-label="게시물 카테고리" className="mx-auto flex w-full max-w-5xl flex-wrap gap-2">
      <Button
        variant={categoryId ? 'secondary' : 'accent'}
        size="sm"
        className="rounded-full"
        aria-pressed={!categoryId}
        onClick={() => replaceSearchParams({ category: null })}
      >
        전체
      </Button>
      {group.categories.map((category) => (
        <Button
          key={category.id}
          variant={categoryId === category.id ? 'accent' : 'secondary'}
          size="sm"
          className="rounded-full"
          aria-pressed={categoryId === category.id}
          onClick={() => {
            replaceSearchParams({ category: category.id });
            trackEvent(ANALYTICS_EVENT.CategoryFilterApplied, {
              group_id: group.id,
              category_id: category.id,
            });
          }}
        >
          {category.name}
        </Button>
      ))}
    </nav>
  );
}
