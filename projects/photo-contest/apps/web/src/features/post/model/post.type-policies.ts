import type { TypePolicies } from '@apollo/client/cache';
import { offsetLimitPagination } from '@apollo/client/utilities';

import { offsetPagePagination } from '@/shared/api/offset-page-pagination';

export const postTypePolicies = {
  Query: {
    fields: {
      galleryPostsPage: offsetPagePagination(['groupId', 'contestId', 'categoryId', 'sort']),
      publicGalleryPostsPage: offsetPagePagination(['sort']),
      myGalleryPostsPage: offsetPagePagination(['groupId']),
      hiddenGalleryPostsPage: offsetPagePagination(['groupId']),
      postComments: offsetLimitPagination(['postId', 'parentId']),
    },
  },
} satisfies TypePolicies;
