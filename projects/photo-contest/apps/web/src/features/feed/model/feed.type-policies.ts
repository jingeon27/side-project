import type { TypePolicies } from '@apollo/client/cache';
import { offsetLimitPagination } from '@apollo/client/utilities';

export const feedTypePolicies: TypePolicies = {
  Query: { fields: { myPhotoFeed: offsetLimitPagination() } },
};
