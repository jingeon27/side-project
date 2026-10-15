import type { QueryRef } from '@apollo/client/react';
import type { GroupQuery, GroupQueryVariables } from '@/shared/api/generated';

export type TGroupQueryRef = QueryRef<GroupQuery, GroupQueryVariables, 'empty' | 'complete' | 'streaming'>;
