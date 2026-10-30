'use client';

import { ROUTES } from '@/shared/constants/routes';
import { useAppRouter } from '@/shared/model/router';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';

import { CreateGroupForm } from './ui/CreateGroupForm';

export function GroupCreatePageTemplate() {
  const router = useAppRouter();
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <TopAppBar title="그룹 만들기" backHref={ROUTES.ME} />
      <div className="mx-auto w-full max-w-3xl px-5 py-6 tablet:px-8">
        <CreateGroupForm
          onCreated={(id) => router.replace(ROUTES.GROUP(id))}
          onCancel={() => router.replace(ROUTES.ME)}
        />
      </div>
    </div>
  );
}
