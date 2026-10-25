'use client';

import { overlay } from 'overlay-kit';

import { buildLoginRedirectPath } from '@/shared/lib/auth-gate.helper';
import { useAppRouter } from '@/shared/model/router';
import { ConfirmDialog } from '@/shared/ui/@core/confirm-dialog';

export function useLoginPrompt() {
  const router = useAppRouter();
  return (nextPath: string) =>
    overlay.open(({ isOpen, close: onClose, unmount }) => (
      <ConfirmDialog
        isOpen={isOpen}
        onClose={onClose}
        unmount={unmount}
        title="로그인이 필요해요"
        description="비공개 그룹은 익명으로 이용할 수 없어요. 로그인 후 가입을 신청해 주세요."
        confirmLabel="로그인하기"
        onConfirm={() => router.push(buildLoginRedirectPath(nextPath))}
      />
    ));
}
