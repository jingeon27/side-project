'use client';

import { useBackgroundQuery, useReadQuery, type QueryRef } from '@apollo/client/react';

import { MyGroupsDocument, type MyGroupsQuery } from '@/shared/api/generated';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { ComposeEntryButton } from '@/widgets/compose-entry';

function ExploreComposeContent({ queryRef }: { queryRef: QueryRef<MyGroupsQuery> }) {
  const { data } = useReadQuery(queryRef);
  return <ComposeEntryButton hasGroups={data.myGroups.length > 0} />;
}

export function ExploreComposeEntry() {
  const [queryRef, { refetch }] = useBackgroundQuery(MyGroupsDocument);
  return (
    <AsyncBoundary onRetry={refetch} fallback={null}>
      <ExploreComposeContent queryRef={queryRef} />
    </AsyncBoundary>
  );
}
