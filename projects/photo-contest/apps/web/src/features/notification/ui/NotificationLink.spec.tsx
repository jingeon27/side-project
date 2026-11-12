import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NotificationLink } from './NotificationLink';

describe('알림 링크의 접근 이름', () => {
  it.each([
    [0, '알림 0개', null],
    [3, '알림 3개', '3'],
    [150, '알림 99+개', '99+'],
  ] as const)('읽지 않은 알림 %i개는 "%s"로 읽혀야 한다', (count, name, badge) => {
    render(<NotificationLink count={count} />);
    const link = screen.getByRole('link', { name });
    // aria-label로 이름을 쓰면 보이는 수와 이름의 낱말이 어긋나 음성 입력 검사(WCAG 2.5.3)에서 실패한다.
    expect(link).not.toHaveAttribute('aria-label');
    // jsdom은 CSS를 계산하지 않아 숨긴 글자를 나눠도 이름이 붙어 보인다. 브라우저는 나눈 글자 사이에 공백을 넣으므로 하나로 둔다.
    expect(link.querySelectorAll('.sr-only')).toHaveLength(1);
    // 보이는 수 배지는 이름과 겹치므로 장식으로 숨기고, 알림이 없으면 그리지 않는다.
    expect(link.querySelector('span[aria-hidden="true"]')?.textContent ?? null).toBe(badge);
  });
});
