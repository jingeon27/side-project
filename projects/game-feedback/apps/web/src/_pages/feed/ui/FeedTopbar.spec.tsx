import { renderToString } from 'react-dom/server';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

import { LanguageProvider } from '@/shared/i18n';

import { FeedTopbar } from './FeedTopbar';

vi.mock('next/navigation', () => ({ useRouter: () => ({}), usePathname: () => '/ko' }));
vi.mock('@/features/auth', () => ({ useSession: () => ({ session: { user: null } }) }));

it.each([
  ['ko', '전체'],
  ['en', 'All'],
  ['ja', 'すべて'],
] as const)('includes the %s current home section in server HTML as the only page H1', (locale, label) => {
  const client = new QueryClient();
  try {
    const html = renderToString(
      <QueryClientProvider client={client}>
        <LanguageProvider initialLocale={locale} initialPreference={locale} automaticLocale={locale}>
          <FeedTopbar locale={locale} />
        </LanguageProvider>
      </QueryClientProvider>,
    );
    expect(html).toContain(`<div class="topbar-title"><h1>${label}</h1></div>`);
    expect(html).not.toContain('src="/icon.svg"');
    expect(html.match(/<h1/g)).toHaveLength(1);
  } finally {
    client.clear();
  }
});
