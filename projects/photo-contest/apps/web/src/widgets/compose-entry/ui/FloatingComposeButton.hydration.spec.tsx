import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

import { act, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FloatingComposeButton } from './FloatingComposeButton';

describe('FloatingComposeButton hydration', () => {
  it('서버 HTML에서는 조작을 막고 공통 버튼의 이벤트 연결 뒤 첫 클릭을 처리해야 한다', async () => {
    const onClick = vi.fn();
    const ui = <FloatingComposeButton label="글쓰기" onClick={onClick} aboveBottomNav />;
    const container = document.body.appendChild(document.createElement('div'));
    container.innerHTML = renderToString(ui);
    const button = within(container).getByRole('button', { name: '글쓰기' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('data-compose-entry', 'true');
    expect(button).toHaveAttribute('data-compose-above-nav', 'true');
    expect(button).toHaveAttribute('data-compact', 'false');
    button.click();
    expect(onClick).not.toHaveBeenCalled();

    const onRecoverableError = vi.fn();
    const root = await act(async () => hydrateRoot(container, ui, { onRecoverableError }));
    try {
      await waitFor(() => expect(button).toBeEnabled());
      await userEvent.setup().click(button);
      expect(onClick).toHaveBeenCalledOnce();
      expect(onRecoverableError).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
