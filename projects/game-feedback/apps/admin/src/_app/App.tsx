import { AsyncBoundary } from '@/shared/ui';
import { QueryProvider } from './providers/QueryProvider';
import { AdminRouter } from './AdminRouter';

export function App() {
  return (
    <QueryProvider>
      <AsyncBoundary>
        <AdminRouter />
      </AsyncBoundary>
    </QueryProvider>
  );
}
