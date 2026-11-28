'use client';

import { useEffect } from 'react';
import Image from 'next/image';

import { useMutation } from '@tanstack/react-query';

import { syncDeviceHistory } from '@/features/journal/device-history';
import { track } from '@/shared/analytics/browser';
import { event } from '@/shared/analytics/events';

import {
  accountProviderSchema,
  providerNames,
  providerSchema,
  type TAccountProvider,
  type TProvider,
} from './navigation';

function consumeLoginResult(sync: () => void) {
  const raw = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith('deokdam.login-result='))
    ?.split('=')[1];
  const provider = accountProviderSchema.safeParse(raw);
  if (provider.success) {
    document.cookie = 'deokdam.login-result=; Max-Age=0; Path=/; SameSite=Lax';
    if (provider.data !== 'local') track(event.SignInCompleted, { provider: provider.data });
    if (location.pathname !== '/journal') sync();
  }
}
export function LoginMeasurement() {
  const { mutate: sync } = useMutation({
    mutationFn: () => syncDeviceHistory(),
    onSuccess: (count) => {
      if (count) track(event.JournalImported, { count });
    },
  });
  useEffect(() => consumeLoginResult(sync), [sync]);
  return null;
}

export function LoginButtons({ next, enabled }: { next: string; enabled: TProvider[] }) {
  const surface = next.startsWith('/shop') ? 'shop' : 'journal';
  return (
    <div className="login-providers">
      {providerSchema.options.map((provider) => (
        <form
          key={provider}
          method="post"
          action={'/api/auth/' + provider}
          onSubmit={() => track(event.SignInClicked, { provider, surface })}
        >
          <input type="hidden" name="next" value={next} />
          <button type="submit" className={'login-button ' + provider} disabled={!enabled.includes(provider)}>
            <Image
              src={provider === 'google' ? '/images/login/google.png' : '/images/login/kakao.svg'}
              width={20}
              height={20}
              alt=""
              unoptimized
            />
            {providerNames[provider]}로 계속하기{!enabled.includes(provider) && ' · 준비 중'}
          </button>
        </form>
      ))}
    </div>
  );
}

export function SignOut({ provider }: { provider: TAccountProvider }) {
  return (
    <form
      method="post"
      action="/api/auth/logout"
      onSubmit={() => {
        if (provider !== 'local') track(event.SignOutClicked, { provider });
      }}
      className="account-line"
    >
      <span>{providerNames[provider]} 계정으로 이용 중</span>
      <button type="submit" className="plain-link">
        로그아웃
      </button>
    </form>
  );
}
