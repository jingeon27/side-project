'use client';
import { useSession } from '@/features/auth';
import { SupportChatButton } from './SupportChatButton';
import { useI18n } from '@/shared/i18n';

export function VerificationPrompt() {
  const { session } = useSession();
  const { t } = useI18n();
  if (!session.user || session.user.isVerified || session.user.role === 'ADMIN') return null;
  return (
    <aside className="verification-prompt" aria-label={t('프로필 인증 안내')}>
      <div>
        <strong>{t('프로필을 인증하고 신뢰를 더해보세요')}</strong>
        <p>{t('인증 없이도 글을 작성할 수 있어요. 관리자와 1:1 채팅으로 프로필 인증을 신청해보세요.')}</p>
      </div>
      <SupportChatButton topic="VERIFICATION" label={t('프로필 인증 신청')} />
    </aside>
  );
}
