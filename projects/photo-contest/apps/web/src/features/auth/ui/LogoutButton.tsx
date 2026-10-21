'use client';

import { useTransition } from 'react';

import { LogOut } from 'lucide-react';

import { ROUTES } from '@/shared/constants/routes';
import { navigateDocument } from '@/shared/lib/document-navigation.helper';
import { resetAnalytics } from '@/shared/model/analytics';
import { useBridge } from '@/shared/model/bridge';
import { getErrorMessage } from '@/shared/model/error';
import { toast } from '@/shared/model/toast';
import { Button } from '@/shared/ui/@core/button';

import { requestLogout } from '../api/auth-request.helper';
import { saveNotifiedUserId } from '../lib/login-marker.helper';

const LOGOUT_FAILED = '로그아웃하지 못했어요. 다시 시도해 주세요.';

/** 로그아웃 뒤 분석 사용자를 지우고 앱에 알린 다음 홈 문서를 새로 연다(이전 사용자의 Apollo 캐시를 버린다). */
export function LogoutButton() {
  const bridge = useBridge();
  const [isPending, startTransition] = useTransition();

  const handleLogout = () =>
    startTransition(async () => {
      try {
        await requestLogout();
      } catch (error) {
        toast.error(getErrorMessage(error, LOGOUT_FAILED));
        return;
      }
      resetAnalytics();
      saveNotifiedUserId(null);
      bridge?.notify('auth.changed', { signedIn: false });
      navigateDocument(ROUTES.HOME);
    });

  return (
    <Button variant="secondary" fullWidth loading={isPending} onClick={handleLogout}>
      <LogOut aria-hidden className="size-4" />
      로그아웃
    </Button>
  );
}
