'use client';

import { LoginPanel, ViewerBoundary } from '@/features/auth';
import { ROUTES } from '@/shared/constants/routes';
import { useAppRouter, useBackNavigation } from '@/shared/model/router';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';

import { CreateGroupForm } from './CreateGroupForm';

export function GroupCreatePage() {
  return (
    <ViewerBoundary
      guest={
        <div className="flex flex-1 flex-col">
          <TopAppBar title="그룹 만들기" backHref={ROUTES.HOME} />
          <div className="p-4">
            <LoginPanel nextPath={ROUTES.GROUP_CREATE} />
          </div>
        </div>
      }
      fallback={<Skeleton className="h-96 w-full" />}
    >
      {() => <GroupCreateContent />}
    </ViewerBoundary>
  );
}

function GroupCreateContent() {
  const router = useAppRouter();
  const handleBack = useBackNavigation(ROUTES.ME);
  return (
    <div data-page-form className="flex min-h-0 min-w-0 flex-col">
      <TopAppBar title="그룹 만들기" backHref={ROUTES.ME} />
      <CreateGroupForm onCreated={(id) => router.replace(ROUTES.GROUP(id))} onCancel={handleBack} />
    </div>
  );
}
