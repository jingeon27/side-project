'use client';

import { ROUTES } from '@/shared/constants/routes';
import { useAppRouter } from '@/shared/model/router';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';

import { CreateGroupForm } from './ui/CreateGroupForm';

export function GroupCreatePageTemplate() {
  const router = useAppRouter();
  return (
    <div data-page-form className="flex min-h-0 min-w-0 flex-col">
      <TopAppBar title="그룹 만들기" backHref={ROUTES.ME} />
      <CreateGroupForm
        onCreated={(id) => router.replace(ROUTES.GROUP(id))}
        onCancel={() => router.replace(ROUTES.ME)}
      />
    </div>
  );
}
