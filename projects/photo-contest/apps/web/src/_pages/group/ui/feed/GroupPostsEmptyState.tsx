'use client';

import { ArrowUpRight, Images } from 'lucide-react';

import type { GalleryQuery } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { replaceSearchParams } from '@/shared/model/router';
import { Button, ButtonLink } from '@/shared/ui/@core/button';
import { EmptyState } from '@/shared/ui/@core/empty-state';

export function GroupPostsEmptyState({
  group,
  categoryId,
}: {
  group: Pick<GalleryQuery['group'], 'id' | 'role'>;
  categoryId: string | null;
}) {
  if (categoryId)
    return (
      <EmptyState
        icon={<Images />}
        title="이 카테고리에는 아직 게시물이 없어요"
        description="다른 카테고리의 게시물을 둘러보세요."
        action={
          <Button variant="secondary" size="lg" onClick={() => replaceSearchParams({ category: null })}>
            전체 게시물 보기 <ArrowUpRight aria-hidden className="size-4" />
          </Button>
        }
      />
    );
  if (!group.role)
    return (
      <EmptyState
        icon={<Images />}
        title="아직 게시물이 없어요"
        description="그룹에 가입하고 첫 이야기를 남겨보세요."
      />
    );
  return (
    <EmptyState
      icon={<Images />}
      title="첫 사진을 올려보세요"
      description="사진이나 동영상, 링크로 웃긴 순간을 나눠보세요. 합성한 이미지도 올릴 수 있어요."
      className="py-8"
      action={
        <ButtonLink href={ROUTES.GROUP_WRITE(group.id)} variant="secondary" size="lg">
          첫 게시물 쓰기 <ArrowUpRight aria-hidden className="size-4" />
        </ButtonLink>
      }
    />
  );
}
