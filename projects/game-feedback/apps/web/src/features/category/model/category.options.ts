import { queryOptions } from '@tanstack/react-query';

import { fetchCategoryList } from '../api/category.api';

export function categoryOptions() {
  return queryOptions({
    queryKey: ['fetchCategoryList'],
    queryFn: fetchCategoryList,
    staleTime: 60_000,
  });
}
