'use client';

import { Button, Dialog } from '@side/design-system';

import { useI18n } from '@/shared/i18n';

interface ILoginRequiredDialogProps {
  open: boolean;
  onClose: () => void;
  onLogin: () => void;
}

export function LoginRequiredDialog({ open, onClose, onLogin }: ILoginRequiredDialogProps) {
  const { t } = useI18n();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('로그인이 필요해요')}
      description={t('로그인 후 이 기능을 이용할 수 있어요.')}
      closeLabel={t('닫기')}
      className="max-w-sm"
    >
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          {t('취소')}
        </Button>
        <Button type="button" variant="primary" onClick={onLogin}>
          {t('로그인하기')}
        </Button>
      </div>
    </Dialog>
  );
}
