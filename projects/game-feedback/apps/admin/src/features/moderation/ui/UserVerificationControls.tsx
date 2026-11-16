import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '@side/design-system';

import { ErrorNotice } from '@/shared/ui';

import type { TAdminUser } from '../api/moderation.api';
import { verifyMutationOptions } from '../model/moderation.mutation-options';

export function UserVerificationControls({ user }: { user: Pick<TAdminUser, 'id' | 'isVerified'> }) {
  const client = useQueryClient();
  const verify = useMutation(verifyMutationOptions(client));
  return (
    <div role="group" aria-label="프로필 인증" className="form-stack">
      <p role="status">{user.isVerified ? '인증된 사용자' : '미인증 사용자'}</p>
      <div className="admin-actions">
        <Button
          type="button"
          variant="secondary"
          disabled={verify.isPending || user.isVerified}
          onClick={() => verify.mutate({ id: user.id, isVerified: true })}
        >
          인증 승인
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={verify.isPending || !user.isVerified}
          onClick={() => verify.mutate({ id: user.id, isVerified: false })}
        >
          인증 해제
        </Button>
      </div>
      <ErrorNotice error={verify.error} />
    </div>
  );
}
