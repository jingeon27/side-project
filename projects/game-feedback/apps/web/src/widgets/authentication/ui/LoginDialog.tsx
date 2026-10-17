'use client';

import { Gamepad2, ShieldCheck } from 'lucide-react';
import { useSession } from '@/features/auth';
import { useI18n } from '@/shared/i18n';
import { Modal } from '@/shared/ui';
import { DemoLoginSection } from './DemoLoginSection';
import { GoogleLoginForm } from './GoogleLoginForm';

interface ILoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function LoginDialog({ open, onOpenChange, onSuccess }: ILoginDialogProps) {
  const { t } = useI18n();
  const { session } = useSession();
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={session?.demoMode ? '함께 플레이할 계정을 골라보세요' : '다음 플레이는 함께, 더 좋게'}
      description={t('플레이메이트에 오신 것을 환영해요.')}
    >
      {!session?.demoMode && (
        <div className="login-icon">
          <Gamepad2 size={34} />
        </div>
      )}
      <GoogleLoginForm configured={session?.googleConfigured ?? false} onSuccess={onSuccess} />
      {session?.demoMode && <DemoLoginSection onSuccess={onSuccess} />}
      <p className="login-footer">
        <ShieldCheck size={14} />
        {t('서로를 존중하는 건강한 피드백 공간')}
      </p>
    </Modal>
  );
}
