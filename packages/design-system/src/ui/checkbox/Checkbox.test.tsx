import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { readStyle } from '../../test/color-tokens';
import { loadTheme } from '../../test/tailwind-theme';
import { Checkbox } from './Checkbox';

it('누르는 영역은 테두리 두께와 관계없이 44×44px이어야 한다', async () => {
  render(<Checkbox aria-label="알림 받기" />);
  const checkbox = screen.getByRole('checkbox', { name: '알림 받기' });
  const afterClasses = checkbox.className.split(/\s+/).filter((name) => name.startsWith('after:'));
  const css = (await loadTheme()).candidatesToCss(afterClasses).join('\n');
  // 가상 요소는 테두리 안쪽을 기준으로 놓인다. 사방 inset으로 넓히면 1px 테두리만큼 줄어 42px가 된다.
  expect(css).not.toMatch(/\binset(?:-[a-z]+)?:/);
  expect(css).toMatch(/width:\s*var\(--spacing-touch\)/);
  expect(css).toMatch(/height:\s*var\(--spacing-touch\)/);
  expect(readStyle('theme.css')).toMatch(/--spacing-touch:\s*44px;/);
});
