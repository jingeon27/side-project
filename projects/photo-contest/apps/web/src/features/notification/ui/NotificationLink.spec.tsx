import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NotificationLink } from './NotificationLink';

describe('알림 링크의 접근 이름', () => {
  it.each([
    [0, '알림', null],
    [3, '알림 3개', '3'],
    [150, '알림 99+개', '99+'],
  ] as const)(
    '읽지 않은 알림 %i개는 보이는 개수를 그대로 담은 "%s"로 읽혀야 한다',
    (count, name, visible) => {
      render(<NotificationLink count={count} />);
      const link = screen.getByRole('link', { name });
      // aria-label로 이름을 덮어쓰면 보이는 개수와 낱말이 어긋나 음성 입력으로 누를 수 없다(WCAG 2.5.3).
      expect(link).not.toHaveAttribute('aria-label');
      if (visible) expect(screen.getByText(visible, { exact: true })).not.toHaveAttribute('aria-hidden');
    },
  );
});
