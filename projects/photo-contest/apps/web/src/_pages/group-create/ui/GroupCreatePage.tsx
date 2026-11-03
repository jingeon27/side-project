'use client';

import { ROUTES } from '@/shared/constants/routes';
import { useAppRouter, useBackNavigation } from '@/shared/model/router';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';

import { CreateGroupForm } from './CreateGroupForm';

export function GroupCreatePage() {
  const router = useAppRouter();
  const handleBack = useBackNavigation(ROUTES.ME);
  return (
    <div data-page-form className="flex min-h-0 min-w-0 flex-col">
      <TopAppBar title="그룹 만들기" backHref={ROUTES.ME} />
      <CreateGroupForm onCreated={(id) => router.replace(ROUTES.GROUP(id))} onCancel={handleBack} />
    </div>
  );
}
