import { useMutation, useQueryClient } from '@tanstack/react-query';
import { match } from 'ts-pattern';

import { Button } from '@side/design-system';

import { statusMutationOptions, type TSupportThread } from '@/features/support';
import { adminSupportPath, adminUserPath, type TSupportStatusFilter } from '@/shared/lib';
import { ErrorNotice } from '@/shared/ui';

interface ISupportThreadCardProps {
  thread: TSupportThread;
  status: TSupportStatusFilter;
}

export function SupportThreadCard({ thread, status: filter }: ISupportThreadCardProps) {
  const client = useQueryClient();
  const status = useMutation(statusMutationOptions(client));
  const topic = match(thread.topic)
    .with('VERIFICATION', () => '프로필 인증 문의')
    .with('GENERAL', () => '관리자 문의')
    .exhaustive();
  function handleToggleStatus() {
    status.mutate({
      id: thread.id,
      status: match(thread.status)
        .with('OPEN', () => 'CLOSED' as const)
        .with('CLOSED', () => 'OPEN' as const)
        .exhaustive(),
    });
  }
  return (
    <article className="admin-card form-stack" data-thread-id={thread.id}>
      <h2>{thread.requester.nickname}</h2>
      <p className="muted">{thread.requester.isVerified ? '프로필 인증' : '프로필 미인증'}</p>
      <p>
        {topic} / {thread.status === 'OPEN' ? '상담 중' : '처리 완료'}
      </p>
      <div className="admin-actions">
        <a href={adminSupportPath(thread.id, filter)}>문의 채팅 열기</a>
        <a href={adminUserPath(thread.requester.id)}>사용자 관리</a>
      </div>
      <Button type="button" variant="secondary" disabled={status.isPending} onClick={handleToggleStatus}>
        {thread.status === 'OPEN' ? '문의 처리 완료' : '문의 다시 열기'}
      </Button>
      <ErrorNotice error={status.error} />
    </article>
  );
}
