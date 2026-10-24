import { renderToString } from 'react-dom/server';

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { installBrowserNavigation } from './browser-navigation';
import { useBrowserSearch } from './use-browser-search';

function SearchSnapshot() {
  return <p>{useBrowserSearch('?q=server', '/ko')}</p>;
}

describe('browser URL subscription with a server snapshot', () => {
  it('renders the supplied URL snapshot in HTML without suspending for browser URL data', () => {
    window.history.replaceState({}, '', '/ko?q=browser');
    expect(renderToString(<SearchSnapshot />)).toContain('?q=server');
  });
  it('observes native history changes and keeps hidden routes on their own initial query', async () => {
    window.history.replaceState({}, '', '/ko?q=first');
    const stop = installBrowserNavigation();
    const hook = renderHook(() => useBrowserSearch('?q=initial', '/ko'));
    try {
      expect(hook.result.current).toBe('?q=first');
      await act(async () => window.history.replaceState({}, '', '/ko?q=second&tab=unanswered'));
      expect(hook.result.current).toBe('?q=second&tab=unanswered');
      await act(async () => window.history.pushState({}, '', '/ko/posts/post-1?q=other'));
      expect(hook.result.current).toBe('?q=initial');
      await act(async () => window.history.replaceState({}, '', '/ko?q=restored'));
      expect(hook.result.current).toBe('?q=restored');
    } finally {
      hook.unmount();
      stop();
    }
  });
});
