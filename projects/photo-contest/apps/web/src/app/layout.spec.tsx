import { isValidElement, type ReactElement } from 'react';

import { describe, expect, it, vi } from 'vitest';

import { AppShell } from '@/_app/shell';

import RootLayout, { viewport } from './layout';

const request = vi.hoisted(() => ({ userAgent: '', theme: 'system' }));

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'user-agent': request.userAgent }),
  cookies: async () => ({ get: () => ({ value: request.theme }) }),
}));
vi.mock('@/_app/providers', () => ({
  AppProviders: ({ children }: { children: unknown }) => children,
}));

function findElement(node: unknown, type: unknown): ReactElement<{ children?: unknown }> | undefined {
  if (Array.isArray(node)) return node.map((child) => findElement(child, type)).find(Boolean);
  if (!isValidElement<{ children?: unknown }>(node)) return undefined;
  if (node.type === type) return node;
  return findElement(node.props.children, type);
}

async function renderHtml(userAgent: string) {
  request.userAgent = userAgent;
  const html = await RootLayout({ children: '화면' });
  if (!isValidElement(html)) throw new Error('html 요소가 아니다');
  return html as ReactElement<{ lang: string; 'data-app'?: string; 'data-theme': string }>;
}

describe('RootLayout', () => {
  it('앱 WebView User-Agent면 <html data-app>에 앱 버전을 붙여야 한다', async () => {
    const html = await renderHtml('Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile PhotoContestApp/1.2.3');
    expect(html.props.lang).toBe('ko');
    expect(html.props['data-app']).toBe('1.2.3');
  });

  it('브라우저에서는 data-app을 붙이지 않아야 한다', async () => {
    const html = await renderHtml('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1');
    expect(html.props['data-app']).toBeUndefined();
  });

  it('화면을 바꾸거나 불러오는 동안에도 남도록 고정 메뉴 틀(AppShell)로 화면을 감싸야 한다', async () => {
    const html = await renderHtml('browser');
    expect(findElement(html, AppShell)?.props.children).toBe('화면');
  });

  it('노치 영역까지 그리되 확대는 막지 않아야 한다', () => {
    expect(viewport).toMatchObject({ width: 'device-width', initialScale: 1, viewportFit: 'cover' });
    expect(viewport).not.toHaveProperty('maximumScale');
    expect(viewport).not.toHaveProperty('userScalable');
  });

  it('저장된 화면 모드를 서버 HTML부터 적용해야 한다', async () => {
    request.theme = 'dark';
    const html = await renderHtml('browser');
    expect(html.props['data-theme']).toBe('dark');
    request.theme = 'system';
  });
});
