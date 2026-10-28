'use client';

import { useTransition } from 'react';

import { LogOut } from 'lucide-react';
import { overlay } from 'overlay-kit';

import { ROUTES } from '@/shared/constants/routes';
import { navigateDocument } from '@/shared/lib/document-navigation.helper';
import { resetAnalytics } from '@/shared/model/analytics';
import { useBridge } from '@/shared/model/bridge';
import { getErrorMessage } from '@/shared/model/error';
import { toast } from '@/shared/model/toast';
import { Button } from '@/shared/ui/@core/button';
import { ConfirmDialog } from '@/shared/ui/@core/confirm-dialog';

import { requestLogout } from '../api/auth-request.helper';
import { saveNotifiedUserId } from '../lib/login-marker.helper';

const LOGOUT_FAILED = '로그아웃하지 못했어요. 다시 시도해 주세요.';

/** 로그아웃 뒤 분석 사용자를 지우고 앱에 알린 다음 홈 문서를 새로 연다(이전 사용자의 Apollo 캐시를 버린다). */
export function LogoutButton({ isAnonymous = false }: { isAnonymous?: boolean }) {
  const bridge = useBridge();
  const [isPending, startTransition] = useTransition();

  const handleLogout = async () => {
    try {
      await requestLogout();
    } catch (error) {
      toast.error(getErrorMessage(error, LOGOUT_FAILED));
      throw error;
    }
    resetAnalytics();
    saveNotifiedUserId(null);
    bridge?.notify('auth.changed', { signedIn: false });
    navigateDocument(ROUTES.SIGN);
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      loading={isPending}
      onClick={() => {
        if (isAnonymous) {
          overlay.open(({ isOpen, close, unmount }) => (
            <ConfirmDialog
              isOpen={isOpen}
              onClose={() => close()}
              unmount={unmount}
              title="익명 프로필에서 로그아웃할까요?"
              description="로그아웃하면 이 익명 프로필과 기록에 다시 접근할 수 없어요. 기록을 계속 이어가려면 먼저 회원가입해 주세요."
              confirmLabel="로그아웃하기"
              onConfirm={handleLogout}
            />
          ));
          return;
        }
        startTransition(async () => {
          try {
            await handleLogout();
          } catch {
            // 실패 안내는 로그아웃 요청에서 표시한다.
          }
        });
      }}
    >
      <LogOut aria-hidden className="size-4" />
      로그아웃
    </Button>
  );
}
