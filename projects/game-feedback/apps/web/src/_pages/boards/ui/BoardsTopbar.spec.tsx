import { renderToString } from 'react-dom/server';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

import { LanguageProvider } from '@/shared/i18n';

import { BoardsTopbar } from './BoardsTopbar';

vi.mock('next/navigation', () => ({ useRouter: () => ({}), usePathname: () => '/ko/boards/feedback' }));
vi.mock('@/features/auth', () => ({ useSession: () => ({ session: { user: null } }) }));

it.each([
  ['ko', 'feedback', '피드백'],
  ['ko', 'friend-sale', '친추판매'],
  ['ko', 'friendly', '전투 모집'],
  ['ko', 'coaching', '게임코치'],
  ['ko', 'free', '자유게시판'],
  ['en', 'friendly', 'Battle recruitment'],
  ['ja', 'coaching', 'ゲームコーチ'],
] as const)('identifies the %s %s board in the server header', (locale, slug, label) => {
  const client = new QueryClient();
  try {
    const html = renderToString(
      <QueryClientProvider client={client}>
        <LanguageProvider initialLocale={locale} initialPreference={locale} automaticLocale={locale}>
          <BoardsTopbar locale={locale} slug={slug} />
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
