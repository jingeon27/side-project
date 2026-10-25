'use client';

import { Suspense } from 'react';

import { LoginPanel } from '@/features/auth';
import { Skeleton } from '@/shared/ui/@core/skeleton';

export function SignPageTemplate({ continuingAnonymously = false }: { continuingAnonymously?: boolean }) {
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-app flex-1 flex-col justify-center px-4 py-8 tablet:py-12">
      <h1 className="mb-6 text-center text-display text-ink">별사대</h1>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <LoginPanel continuingAnonymously={continuingAnonymously} />
      </Suspense>
    </div>
  );
}
