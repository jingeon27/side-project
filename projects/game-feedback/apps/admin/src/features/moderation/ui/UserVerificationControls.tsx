import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '@side/design-system';

import { ErrorNotice } from '@/shared/ui';

import type { TAdminUser } from '../api/moderation.api';
import { verifyMutationOptions } from '../model/moderation.mutation-options';

export function UserVerificationControls({
  user,
  onVerified,
}: {
  user: Pick<TAdminUser, 'id' | 'isVerified'>;
  onVerified?: () => Promise<void>;
}) {
  const client = useQueryClient();
  const verify = useMutation(verifyMutationOptions(client, onVerified));
  return (
    <div role="group" aria-label="프로필 인증" className="form-stack">
      <p role="status">{user.isVerified ? '인증된 사용자' : '미인증 사용자'}</p>
      <div className="admin-actions">
        <Button
          type="button"
          aria-label="프로필 인증 승인"
          aria-pressed={user.isVerified}
          variant={user.isVerified ? undefined : 'secondary'}
          disabled={verify.isPending || user.isVerified}
          onClick={() => verify.mutate({ id: user.id, isVerified: true })}
        >
          인증
        </Button>
        <Button
          type="button"
          aria-label="인증 해제"
          aria-pressed={!user.isVerified}
          variant={user.isVerified ? 'secondary' : undefined}
          disabled={verify.isPending || !user.isVerified}
          onClick={() => verify.mutate({ id: user.id, isVerified: false })}
        >
          미인증
        </Button>
      </div>
      <ErrorNotice error={verify.error} />
    </div>
  );
}
