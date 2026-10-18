'use client';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@side/design-system';
import { appRoutes } from '@game-feedback/bridge';
import type { TSupportThread } from '@game-feedback/contracts';
import { supportStatusMutationOptions } from '@/features/support';
import { useI18n } from '@/shared/i18n';
import { ErrorNotice } from '@/shared/ui';
import { AdminUserControls } from './AdminUserControls';
export function SupportThreadCard({ thread, adminId }: { thread: TSupportThread; adminId: string }) {
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const mutation = useMutation(supportStatusMutationOptions(client));
  return (
    <article className="settings-card form-stack" data-support-id={thread.id}>
      <strong>{thread.requester.nickname}</strong>
      <p>{t(thread.topic === 'VERIFICATION' ? '프로필 인증 문의' : '관리자 문의')}</p>
      <p>{t(thread.status === 'OPEN' ? '상담 중' : '처리 완료')}</p>
      <Link className="text-button" href={appRoutes.conversation(locale, thread.conversationId)}>
        {t('문의 채팅 열기')}
      </Link>
      <Button
        type="button"
        variant="secondary"
        loading={mutation.isPending}
        onClick={() =>
          mutation.mutate({ id: thread.id, status: thread.status === 'OPEN' ? 'CLOSED' : 'OPEN' })
        }
      >
        {t(thread.status === 'OPEN' ? '문의 처리 완료' : '문의 다시 열기')}
      </Button>
      <AdminUserControls adminId={adminId} userId={thread.requester.id} />
      <ErrorNotice message={mutation.error?.message} />
    </article>
  );
}
