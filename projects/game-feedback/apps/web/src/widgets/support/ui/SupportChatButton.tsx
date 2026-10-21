'use client';

import { useRouter } from 'next/navigation';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { appRoutes } from '@game-feedback/bridge';
import { Button } from '@side/design-system';

import { useSession } from '@/features/auth';
import { startSupportMutationOptions } from '@/features/support';
import { useI18n } from '@/shared/i18n';
import { ErrorNotice } from '@/shared/ui';

export function SupportChatButton({
  topic = 'GENERAL',
  label,
}: {
  topic?: 'GENERAL' | 'VERIFICATION';
  label?: string;
}) {
  const { t, locale } = useI18n();
  const { session, login } = useSession();
  const client = useQueryClient();
  const router = useRouter();
  const mutation = useMutation(startSupportMutationOptions(client, session.user?.id));
  return (
    <div className="support-action">
      <Button
        variant="secondary"
        type="button"
        loading={mutation.isPending}
        onClick={async () => {
          if (!session.user) {
            login();
            return;
          }
          try {
            const conversation = await mutation.mutateAsync(topic);
            router.push(appRoutes.conversation(locale, conversation.id));
          } catch {
            /* The error stays beside the action. */
          }
        }}
      >
        {label ?? t(topic === 'VERIFICATION' ? '프로필 인증 문의' : '관리자에게 문의하기')}
      </Button>
      <ErrorNotice message={mutation.error?.message} />
    </div>
  );
}
