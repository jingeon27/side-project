'use client';
import { useState } from 'react';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Button, Input } from '@side/design-system';
import { UserBanInputSchema } from '@game-feedback/contracts';
import { adminUserOptions, banUserMutationOptions, verifyUserMutationOptions } from '@/features/moderation';
import { useZodForm } from '@/shared/model/form';
import { useI18n } from '@/shared/i18n';
import { AsyncBoundary, Field, ErrorNotice } from '@/shared/ui';

export function AdminUserControls({ adminId, userId }: { adminId: string; userId: string }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  return (
    <details onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>{t('사용자 관리')}</summary>
      {expanded && (
        <AsyncBoundary title={t('사용자 관리')} clientOnly>
          <UserControls adminId={adminId} userId={userId} />
        </AsyncBoundary>
      )}
    </details>
  );
}
function UserControls({ adminId, userId }: { adminId: string; userId: string }) {
  const { t } = useI18n();
  const { data: user } = useSuspenseQuery(adminUserOptions(adminId, userId));
  const client = useQueryClient();
  const ban = useMutation(banUserMutationOptions(client));
  const verify = useMutation(verifyUserMutationOptions(client));
  const form = useZodForm(UserBanInputSchema.pick({ reason: true }), { defaultValues: { reason: '' } });
  return (
    <div className="form-stack admin-user" data-user-id={user.id}>
      <strong>{user.nickname}</strong>
      <p>{user.supercellTag ?? t('등록된 게임 계정 없음')}</p>
      <p>{t(user.isVerified ? '인증된 사용자' : '인증 대기')}</p>
      {user.bannedAt && (
        <p role="status">
          {t('이용 제한 중')}: {user.banReason}
        </p>
      )}
      <Button
        variant="secondary"
        type="button"
        loading={verify.isPending}
        onClick={() => verify.mutate({ id: userId, isVerified: !user.isVerified })}
      >
        {t(user.isVerified ? '인증 해제' : '프로필 인증 승인')}
      </Button>
      {user.role !== 'ADMIN' && (
        <form
          className="form-stack"
          onSubmit={form.handleSubmit(async ({ reason }) => {
            try {
              await ban.mutateAsync({ id: userId, banned: !user.bannedAt, reason });
              form.reset();
            } catch {
              /* Keep the reason and mutation error visible. */
            }
          })}
        >
          <Field
            label={t('제재 사유')}
            error={form.formState.errors.reason ? t('사유를 입력해주세요.') : undefined}
          >
            <Input {...form.register('reason')} maxLength={500} />
          </Field>
          <Button variant={user.bannedAt ? 'secondary' : 'danger'} type="submit" loading={ban.isPending}>
            {t(user.bannedAt ? '밴 해제' : '사용자 밴')}
          </Button>
        </form>
      )}
      <ErrorNotice message={ban.error?.message ?? verify.error?.message} />
    </div>
  );
}
