import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useIsSSR } from './use-is-ssr';

function Probe() {
  return <p>{useIsSSR() ? '서버' : '브라우저'}</p>;
}

afterEach(() => cleanup());

describe('useIsSSR', () => {
  it('서버 렌더링에서는 true여야 한다', () => {
    expect(renderToString(<Probe />)).toContain('서버');
  });

  it('hydration은 서버 HTML과 맞춘 뒤 브라우저 값으로 바꿔야 한다', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<Probe />);
    document.body.append(container);
    const onRecoverableError = vi.fn();
    let root: Root | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, <Probe />, { onRecoverableError });
      });
      expect(container.textContent).toBe('브라우저');
      expect(onRecoverableError).not.toHaveBeenCalled();
    } finally {
      act(() => root?.unmount());
      container.remove();
    }
  });

  it('hydration 없이 그리면 처음부터 false여야 한다', () => {
    render(<Probe />);
    expect(screen.getByText('브라우저').textContent).toBe('브라우저');
  });
});
