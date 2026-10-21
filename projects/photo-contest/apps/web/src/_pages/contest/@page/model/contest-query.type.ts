import type { QueryRef } from '@apollo/client/react';

import type { ContestQuery, ContestQueryVariables } from '@/shared/api/generated';

export type TContestQueryRef = QueryRef<
  ContestQuery,
  ContestQueryVariables,
  'empty' | 'complete' | 'streaming'
>;
