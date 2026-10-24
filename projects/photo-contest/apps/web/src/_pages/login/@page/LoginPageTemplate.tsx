'use client';

import { Suspense } from 'react';

import { LoginPanel } from '@/features/auth';
import { ROUTES } from '@/shared/constants/routes';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';

export function LoginPageTemplate() {
  return (
    <div className="flex flex-1 flex-col">
      <TopAppBar title="로그인" backHref={ROUTES.HOME} />
      <div className="mx-auto w-full max-w-app px-4 py-6">
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <LoginPanel allowAnonymous={false} />
        </Suspense>
      </div>
    </div>
  );
}
