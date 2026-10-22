import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { Checkbox } from './Checkbox';

it('16px 상자의 누르는 영역을 사방 14px씩 넓혀 44×44px로 만들어야 한다', () => {
  render(<Checkbox aria-label="알림 받기" />);
  const checkbox = screen.getByRole('checkbox', { name: '알림 받기' });
  expect(checkbox).toHaveClass('size-4', 'after:absolute', 'after:-inset-3.5');
  expect(checkbox.className).not.toMatch(/after:-inset-[xy]-/);
});
