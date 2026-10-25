'use client';

import { useId } from 'react';
import { useSearchParams } from 'next/navigation';

import { useMutation } from '@apollo/client/react';

import { StartAnonymousSessionDocument } from '@/shared/api/generated';
import { NEXT_PATH_PARAM } from '@/shared/constants/auth';
import { ROUTES } from '@/shared/constants/routes';
import { getSafeNextPath } from '@/shared/lib/auth-gate.helper';
import { cn } from '@/shared/lib/cn.helper';
import { navigateDocument } from '@/shared/lib/document-navigation.helper';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { useBridge } from '@/shared/model/bridge';
import { Button } from '@/shared/ui/@core/button';
import { LegalLinks } from '@/shared/ui/@core/legal-links';

import { completeLogin } from '../lib/complete-login.helper';
import { PasswordAuthForms } from './PasswordAuthForms';

interface ILoginPanelProps {
  /** 로그인 뒤 돌아갈 경로. 없으면 주소의 `?next=`(proxy가 붙인 원래 경로), 그것도 없으면 홈 */
  nextPath?: string;
  className?: string;
  allowAnonymous?: boolean;
  continuingAnonymously?: boolean;
}

function AnonymousStartButton({ nextPath, continuing = false }: { nextPath: string; continuing?: boolean }) {
  const bridge = useBridge();
  const [start, { loading }] = useMutation(StartAnonymousSessionDocument);
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        fullWidth
        loading={loading}
        onClick={async () => {
          if (continuing) {
            navigateDocument(ROUTES.HOME);
            return;
          }
          trackEvent(ANALYTICS_EVENT.LoginStarted, { provider: 'anonymous' });
          try {
            await start();
            completeLogin(bridge, 'anonymous', nextPath);
          } catch {
            /* ErrorLink가 실패를 안내한다. */
          }
        }}
      >
        {continuing ? '익명으로 계속하기' : '익명으로 시작하기'}
      </Button>
      <p className="text-caption text-muted">
        공개 그룹에 참여할 수 있어요. 비공개 그룹은 로그인이 필요해요.
      </p>
    </div>
  );
}

export function LoginPanel({
  nextPath,
  className,
  allowAnonymous = true,
  continuingAnonymously = false,
}: ILoginPanelProps) {
  const headingId = useId();
  const searchParams = useSearchParams();
  const next = getSafeNextPath(nextPath ?? searchParams.get(NEXT_PATH_PARAM));

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'flex flex-col gap-5 rounded-card border border-line bg-surface p-6 tablet:p-8',
        className,
      )}
    >
      <div className="pb-2 text-center">
        <p className="text-caption text-muted">친구들과 나누는 웃긴 순간</p>
        <h2 id={headingId} className="mt-2 text-title-lg text-ink">
          함께 웃는 순간을 나눠요
        </h2>
        <p className="mt-1 text-body text-muted">그룹에 참여해 사진과 동영상을 나눠보세요.</p>
      </div>
      {allowAnonymous ? <AnonymousStartButton nextPath={next} continuing={continuingAnonymously} /> : null}
      <PasswordAuthForms nextPath={next} />
      <div className="border-t border-line pt-3">
        <p className="text-caption text-muted">서비스 이용에 관한 안내를 확인해 주세요.</p>
        <LegalLinks />
      </div>
    </section>
  );
}
