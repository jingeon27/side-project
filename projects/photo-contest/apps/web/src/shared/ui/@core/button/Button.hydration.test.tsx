import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

import { act, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { IconButton } from '../icon-button';
import { Button } from './Button';

const cases = [
  {
    name: 'Button',
    render: (onClick: () => void, disabled = false) => (
      <Button onClick={onClick} disabled={disabled}>
        열기
      </Button>
    ),
  },
  {
    name: 'IconButton',
    render: (onClick: () => void, disabled = false) => (
      <IconButton label="열기" onClick={onClick} disabled={disabled}>
        +
      </IconButton>
    ),
  },
];

describe.each(cases)('$name hydration', ({ render }) => {
  it('서버 HTML에서는 조작을 막고 이벤트 연결 뒤 첫 클릭을 처리한다', async () => {
    const onClick = vi.fn();
    const ui = render(onClick);
    const container = document.body.appendChild(document.createElement('div'));
    container.innerHTML = renderToString(ui);
    const button = within(container).getByRole('button', { name: '열기' });
    expect(button).toBeDisabled();
    button.click();
    expect(onClick).not.toHaveBeenCalled();

    const root = await act(async () => hydrateRoot(container, ui));
    try {
      await waitFor(() => expect(button).toBeEnabled());
      await userEvent.setup().click(button);
      expect(onClick).toHaveBeenCalledOnce();
      await act(async () => root.render(render(onClick, true)));
      expect(button).toBeDisabled();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
