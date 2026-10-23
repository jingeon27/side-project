import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';

import { Button } from '@side/design-system';

import { userOptions, verifyMutationOptions } from '@/features/moderation';
import { ErrorNotice } from '@/shared/ui';

import { UserBanForm } from './UserBanForm';

export function UserPanel({ userId }: { userId: string }) {
  const client = useQueryClient();
  const { data: user } = useSuspenseQuery(userOptions(userId));
  const verify = useMutation(verifyMutationOptions(client));
  return (
    <article className="admin-card form-stack" aria-label="사용자 관리" data-user-id={user.id}>
      <h2>{user.nickname}</h2>
      <p className="muted">{user.id}</p>
      <p>게임 태그: {user.supercellTag ?? '미등록'}</p>
      <p>{user.isVerified ? '인증된 사용자' : '미인증 사용자'}</p>
      <Button
        variant="secondary"
        type="button"
        disabled={verify.isPending}
        onClick={() => verify.mutate({ id: user.id, isVerified: !user.isVerified })}
      >
        {user.isVerified ? '인증 해제' : '프로필 인증 승인'}
      </Button>
      {user.bannedAt && <p role="status">이용 제한 중: {user.banReason}</p>}
      {user.role !== 'ADMIN' && <UserBanForm user={user} />}
      <ErrorNotice error={verify.error} />
    </article>
  );
}
