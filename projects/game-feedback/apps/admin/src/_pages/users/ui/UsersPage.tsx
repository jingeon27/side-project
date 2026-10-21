import { AsyncBoundary } from '@/shared/ui';
import { UserPanel } from '@/widgets/user-panel';

import { UserSearchForm } from './UserSearchForm';

export function UsersPage({ userId }: { userId: string }) {
  return (
    <section className="form-stack">
      <h1>사용자 관리</h1>
      <UserSearchForm key={userId} initialUserId={userId} />
      {userId && (
        <AsyncBoundary key={userId}>
          <UserPanel userId={userId} />
        </AsyncBoundary>
      )}
    </section>
  );
}
