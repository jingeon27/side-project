'use client';
import { GalleryFeed } from '@/features/post';
import type { GalleryQuery } from '@/shared/api/generated';
import { ANALYTICS_EVENT,trackEvent } from '@/shared/model/analytics';
import { replaceSearchParams } from '@/shared/model/router';
import { Button } from '@/shared/ui/@core/button';
import { useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { parseGroupCategory } from '../model/category-search.schema';

export function GroupCategoryFilter({
  group,
  sidebar,
}: {
  group: GalleryQuery['group'];
  sidebar?: ReactNode;
}) {
  const search = useSearchParams();
  const categoryId = parseGroupCategory(search.get('category'), group.categories);
  return (
    <div className="flex flex-col gap-5">
      {group.categories.length ? (
        <nav aria-label="게시물 카테고리" className="mx-auto flex w-full max-w-5xl flex-wrap gap-2">
          <Button
            variant={categoryId ? 'secondary' : 'primary'}
            size="sm"
            aria-pressed={!categoryId}
            onClick={() => replaceSearchParams({ category: null })}
          >
            전체
          </Button>
          {group.categories.map((category) => (
            <Button
              key={category.id}
              variant={categoryId === category.id ? 'primary' : 'secondary'}
              size="sm"
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
      ) : null}
      <GalleryFeed groupId={group.id} categoryId={categoryId ?? undefined} sidebar={sidebar} />
    </div>
  );
}
