'use client';

import { useBackgroundQuery } from '@apollo/client/react';

import { GroupProfileDocument } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { useAppRouter } from '@/shared/model/router';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';

import { EditGroupProfileForm } from './ui/EditGroupProfileForm';

export function GroupEditPageTemplate({ groupId }: { groupId: string }) {
  const router = useAppRouter();
  const [queryRef, { refetch }] = useBackgroundQuery(GroupProfileDocument, { variables: { id: groupId } });
  const returnPath = ROUTES.GROUP(groupId);
  return (
    <div data-page-form className="flex min-h-0 min-w-0 flex-col">
      <TopAppBar title="그룹 프로필 수정" backHref={returnPath} />
      <AsyncBoundary onRetry={refetch} fallback={<Skeleton className="h-64 w-full" />}>
        <EditGroupProfileForm
          queryRef={queryRef}
          onSaved={() => router.replace(returnPath)}
          onCancel={() => router.replace(returnPath)}
        />
      </AsyncBoundary>
    </div>
  );
}
