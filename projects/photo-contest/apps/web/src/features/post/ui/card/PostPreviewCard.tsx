'use client';

import { useFragment } from '@apollo/client/react';

import { GalleryPostCardFragmentDoc } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { ButtonLink } from '@/shared/ui/@core/button';

import { PostCardFrame } from './PostCardFrame';

/** 가입한 그룹이 없는 사람에게 보여 주는 공개 그룹 게시물. 반응 대신 그룹으로 안내한다. */
export function PostPreviewCard({ id }: { id: string }) {
  const { data: post, complete } = useFragment({
    fragment: GalleryPostCardFragmentDoc,
    from: { __typename: 'GalleryPost', id },
  });
  if (!complete) return null;
  return (
    <PostCardFrame
      id={id}
      actions={
        <ButtonLink href={ROUTES.GROUP(post.groupId)} variant="secondary" size="md">
          그룹 보기
        </ButtonLink>
      }
    />
  );
}
