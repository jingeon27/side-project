import { Suspense, type ReactNode } from 'react';
import { serviceContext } from '../providers/service-context.server';
import { LoadingState } from '@/shared/ui';

export async function isClientNavigation() {
  return (await serviceContext()).navigation;
}

// Initial public documents finish the body before sending HTML. Client navigations
// can show the prefetched placeholder while fresh, viewer-authorized data arrives.
export async function DocumentContent({ children }: { children: ReactNode }) {
  if (!(await serviceContext()).navigation) return children;
  return <Suspense fallback={<LoadingState />}>{children}</Suspense>;
}
