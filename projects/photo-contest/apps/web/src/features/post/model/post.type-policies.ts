import type { TypePolicies } from '@apollo/client/cache';
import { offsetLimitPagination } from '@apollo/client/utilities';

export const postTypePolicies = {
  Query: {
    fields: {
      galleryPosts: offsetLimitPagination(['groupId', 'contestId', 'categoryId', 'sort']),
      publicGalleryPosts: offsetLimitPagination(['sort']),
      myGalleryPosts: offsetLimitPagination(['groupId']),
      hiddenGalleryPosts: offsetLimitPagination(['groupId']),
      postComments: offsetLimitPagination(['postId', 'parentId']),
    },
  },
} satisfies TypePolicies;
