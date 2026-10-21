import { Suspense, type ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';

import type { TLocale } from '@/shared/i18n';
import { getSeoConfig } from '@/shared/seo';

import { serviceContext } from '../providers/service-context.server';
import { ServiceProviders } from '../providers/ServiceProviders';
import { BootstrapBoundary } from './BootstrapBoundary';

export const rootViewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};
export const rootMetadata: Metadata = {
  metadataBase: new URL(getSeoConfig().origin),
  title: { default: '플레이메이트 | Game Feedback', template: '%s | 플레이메이트' },
  description: '클래시 로얄 플레이어를 위한 게임 피드백 커뮤니티.',
  robots: { index: false, follow: false },
};

export function RootDocument(props: { children: ReactNode; locale: TLocale }) {
  return (
    <BootstrapBoundary locale={props.locale}>
      <Suspense fallback={null}>
        <RequestDocument {...props} />
      </Suspense>
    </BootstrapBoundary>
  );
}

async function RequestDocument({ children, locale }: { children: ReactNode; locale: TLocale }) {
  const context = await serviceContext();
  return (
    <html lang={locale} data-theme={context.theme} suppressHydrationWarning>
      <body>
        <ServiceProviders locale={locale} context={context}>
          {children}
        </ServiceProviders>
      </body>
    </html>
  );
}
