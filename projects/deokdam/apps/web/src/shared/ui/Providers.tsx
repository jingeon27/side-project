'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { Toaster } from '@side/design-system/ui/sonner';

import { LoginMeasurement } from '@/features/account/AccountActions';

let browserClient: QueryClient | undefined;
function queryClient() {
  if (typeof window === 'undefined') return new QueryClient();
  browserClient ??= new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return browserClient;
}
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient()}>
      <LoginMeasurement />
      {children}
      <Toaster theme="light" position="top-center" closeButton />
    </QueryClientProvider>
  );
}
