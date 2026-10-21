import type { TypePolicies } from '@apollo/client/cache';
import { offsetLimitPagination } from '@apollo/client/utilities';

export const postTypePolicies: TypePolicies = {
  Query: {
    fields: {
      galleryPosts: offsetLimitPagination(['groupId', 'contestId', 'categoryId', 'sort']),
      publicGalleryPosts: offsetLimitPagination(['sort']),
      hiddenGalleryPosts: offsetLimitPagination(['groupId']),
      postComments: offsetLimitPagination(['postId', 'parentId']),
    },
  },
};
