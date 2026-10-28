import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';

import { ThemeProvider } from '../../../model/theme';
import { ThemeSettings } from './ThemeSettings';

it('화면 모드는 hydration 뒤 첫 조작으로 목록을 열고 선택을 반영한다', async () => {
  const ui = (
    <ThemeProvider initialPreference="system">
      <ThemeSettings />
    </ThemeProvider>
  );
  const container = document.body.appendChild(document.createElement('div'));
  container.innerHTML = renderToString(ui);
  const select = within(container).getByRole('combobox', { name: '화면 모드' });
  expect(select).toBeDisabled();
  const root = await act(async () => hydrateRoot(container, ui));
  try {
    await waitFor(() => expect(select).toBeEnabled());
    const user = userEvent.setup();
    await user.click(select);
    await user.click(await screen.findByRole('option', { name: '라이트 모드' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
