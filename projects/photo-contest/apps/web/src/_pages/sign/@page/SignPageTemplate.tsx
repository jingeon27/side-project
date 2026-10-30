'use client';

import { Suspense } from 'react';

import { LoginPanel } from '@/features/auth';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { BrandIcon } from '@/shared/ui/@core/top-app-bar';

export function SignPageTemplate({ continuingAnonymously = false }: { continuingAnonymously?: boolean }) {
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-app flex-1 flex-col justify-center px-4 py-8 tablet:py-12">
      <h1 className="mb-8 flex items-center justify-center gap-2.5 text-display text-ink">
        <BrandIcon className="size-10 -rotate-6" />
        피식
      </h1>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <LoginPanel continuingAnonymously={continuingAnonymously} />
      </Suspense>
    </div>
  );
}
