import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Button, Input } from '@side/design-system';
import { UserBanInputSchema } from '@game-feedback/contracts';
import { userOptions, verifyMutationOptions, banMutationOptions } from '@/features/moderation';
import { useZodForm } from '@/shared/model';
import { ErrorNotice } from '@/shared/ui';
export function UserPanel({ userId }: { userId: string }) {
  const client = useQueryClient();
  const { data: user } = useSuspenseQuery(userOptions(userId));
  const verify = useMutation(verifyMutationOptions(client));
  const ban = useMutation(banMutationOptions(client));
  const form = useZodForm(UserBanInputSchema.pick({ reason: true }), { defaultValues: { reason: '' } });
  const handleBan = form.handleSubmit(async ({ reason }) => {
    try {
      await ban.mutateAsync({ id: user.id, banned: !user.bannedAt, reason });
      form.reset();
    } catch {
      /* Preserve the entered reason for retry. */
    }
  });
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
      {user.role !== 'ADMIN' && (
        <form className="form-stack" onSubmit={handleBan}>
          <label>
            제재 사유
            <Input {...form.register('reason')} maxLength={500} placeholder="제재 또는 해제 사유" />
          </label>
          {form.formState.errors.reason && <p role="alert">사유를 입력해주세요.</p>}
          <Button type="submit" variant={user.bannedAt ? 'secondary' : 'danger'} disabled={ban.isPending}>
            {user.bannedAt ? '밴 해제' : '사용자 밴'}
          </Button>
        </form>
      )}
      <ErrorNotice error={verify.error ?? ban.error} />
    </article>
  );
}
