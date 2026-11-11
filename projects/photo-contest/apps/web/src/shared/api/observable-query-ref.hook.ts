'use client';

import { useQueryRefHandlers, useReadQuery, type QueryRef } from '@apollo/client/react';
import { assertWrappedQueryRef, unwrapQueryRef } from '@apollo/client/react/internal';

/** 프리로드와 Suspense를 소유한 QueryRef에서 같은 Apollo 조회의 현재 상태를 읽는다. */
export function useObservableQueryRef<TData>(queryRef: QueryRef<TData>) {
  const { fetchMore, refetch } = useQueryRefHandlers(queryRef);
  const result = useReadQuery(queryRef);
  // QueryRef가 사용하는 ObservableQuery를 꺼내는 Apollo 내부 접근은 여기에 모은다.
  assertWrappedQueryRef(queryRef);
  return { ...result, fetchMore, refetch, observable: unwrapQueryRef(queryRef).observable };
}
