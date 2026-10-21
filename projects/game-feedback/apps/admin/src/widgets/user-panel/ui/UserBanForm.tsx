import { Button, Input } from '@side/design-system';

import { useBanUserMutation, type TAdminUser } from '@/features/moderation';
import { useZodForm } from '@/shared/model';
import { ErrorNotice } from '@/shared/ui';

import { userBanSchema } from '../model/user-ban.schema';

export function UserBanForm({ user }: { user: TAdminUser }) {
  const ban = useBanUserMutation();
  const form = useZodForm(userBanSchema, { defaultValues: { reason: '' } });
  const handleBan = form.handleSubmit(async ({ reason }) => {
    try {
      await ban.mutateAsync({ id: user.id, banned: !user.bannedAt, reason });
      form.reset();
    } catch {
      // Preserve the entered reason for retry.
    }
  });
  return (
    <form className="form-stack" onSubmit={handleBan}>
      <label>
        제재 사유
        <Input
          {...form.register('reason')}
          maxLength={500}
          placeholder="제재 또는 해제 사유"
          aria-invalid={Boolean(form.formState.errors.reason)}
        />
      </label>
      {form.formState.errors.reason && <p role="alert">사유를 입력해주세요.</p>}
      <Button type="submit" variant={user.bannedAt ? 'secondary' : 'danger'} disabled={ban.isPending}>
        {user.bannedAt ? '밴 해제' : '사용자 밴'}
      </Button>
      <ErrorNotice error={ban.error} />
    </form>
  );
}
