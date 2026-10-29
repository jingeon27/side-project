import { useSuspenseQuery } from '@tanstack/react-query';

import { userOptions, UserVerificationControls } from '@/features/moderation';

import { UserBanForm } from './UserBanForm';

export function UserPanel({ userId }: { userId: string }) {
  const { data: user } = useSuspenseQuery(userOptions(userId));
  return (
    <article className="admin-card form-stack" aria-label="사용자 관리" data-user-id={user.id}>
      <h2>{user.nickname}</h2>
      <p className="muted">{user.id}</p>
      <p>게임 태그: {user.supercellTag ?? '미등록'}</p>
      <UserVerificationControls user={user} />
      {user.bannedAt && (
        <p role="status" aria-label="이용 제한">
          이용 제한 중: {user.banReason}
        </p>
      )}
      {user.role !== 'ADMIN' && <UserBanForm user={user} />}
    </article>
  );
}
