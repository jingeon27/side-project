import type { QueryRef } from '@apollo/client/react';
import type { GalleryQuery, GalleryQueryVariables } from '@/shared/api/generated';

export type TGroupQueryRef = QueryRef<
  GalleryQuery,
  GalleryQueryVariables,
  'empty' | 'complete' | 'streaming'
>;
