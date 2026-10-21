import { AsyncBoundary } from '@/shared/ui';

import { AdminRouter } from './AdminRouter';
import { QueryProvider } from './providers/QueryProvider';

export function App() {
  return (
    <QueryProvider>
      <AsyncBoundary>
        <AdminRouter />
      </AsyncBoundary>
    </QueryProvider>
  );
}
