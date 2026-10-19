import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminPage } from '@/_pages/admin';
import { AsyncBoundary } from '@/shared/ui';
export function App() {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1 } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <AsyncBoundary>
        <AdminPage />
      </AsyncBoundary>
    </QueryClientProvider>
  );
}
