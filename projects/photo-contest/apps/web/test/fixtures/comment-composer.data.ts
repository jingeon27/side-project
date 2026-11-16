import type { ApolloClient } from '@apollo/client';

import {
  GalleryPostCardFragmentDoc,
  MeDocument,
  PostCommentsDocument,
  type GalleryPostCardFragment,
  type PostCommentCardFragment,
} from '../../src/shared/api/generated';

export const COMMENT_VIEWER = {
  __typename: 'User' as const,
  id: 'viewer',
  nickname: '댓글 회원',
  avatar: null,
  needsOnboarding: false,
  isAnonymous: false,
};

export const COMMENT_POST = {
  __typename: 'GalleryPost',
  id: 'post-1',
  groupId: 'group-1',
  groupName: '댓글 그룹',
  title: '댓글 테스트 사진',
  body: '',
  category: null,
  contestId: null,
  contest: null,
  kind: 'PHOTO',
  mediaUrl: '/brand/afternoon-cat.svg',
  mediaWidth: null,
  mediaHeight: null,
  linkUrl: null,
  createdAt: '2026-11-12T00:00:00.000Z',
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
  canDelete: false,
  canModerate: false,
  canInteract: true,
  author: COMMENT_VIEWER,
} satisfies GalleryPostCardFragment;

export function commentRow(body: string, parentId: string | null): PostCommentCardFragment {
  return {
    __typename: 'PostComment',
    id: 'created-comment',
    postId: COMMENT_POST.id,
    parentId,
    body,
    createdAt: COMMENT_POST.createdAt,
    replyCount: 0,
    likeCount: 0,
    likedByMe: false,
    canInteract: true,
    canDelete: true,
    author: COMMENT_VIEWER,
  };
}

export function seedCommentComposer(client: ApolloClient, parentId: string | null) {
  client.writeQuery({ query: MeDocument, data: { me: COMMENT_VIEWER } });
  client.writeFragment({ fragment: GalleryPostCardFragmentDoc, data: COMMENT_POST });
  client.writeQuery({
    query: PostCommentsDocument,
    variables: { postId: COMMENT_POST.id, parentId, offset: 0, limit: 24 },
    data: { postComments: [], postCommentCount: 0 },
  });
}
