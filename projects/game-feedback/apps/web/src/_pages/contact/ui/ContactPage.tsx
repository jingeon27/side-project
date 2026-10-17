'use client';
import { SupportChatButton } from '@/widgets/support';
import { useI18n } from '@/shared/i18n';
export function ContactPage() {
  const { t } = useI18n();
  return (
    <section className="settings-card form-stack" aria-label={t('관리자 문의')}>
      <h2>{t('관리자와 1:1 채팅')}</h2>
      <p>{t('문의는 비공개 1:1 채팅으로 이어집니다. 프로필 인증은 관리자 확인 후 처리됩니다.')}</p>
      <SupportChatButton />
      <SupportChatButton topic="VERIFICATION" />
    </section>
  );
}
