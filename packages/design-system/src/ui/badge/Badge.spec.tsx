import { createRef } from 'react';

import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { Badge } from './Badge';

it('native span props와 ref를 전달하고 tone 클래스 뒤에 className을 합쳐야 한다', () => {
  const ref = createRef<HTMLSpanElement>();
  render(
    <Badge ref={ref} id="phase" title="접수 중인 대회" data-phase="open" tone="accent" className="px-3">
      접수 중
    </Badge>,
  );
  const badge = screen.getByText('접수 중');
  expect(ref.current).toBe(badge);
  expect(badge).toHaveAttribute('id', 'phase');
  expect(badge).toHaveAttribute('title', '접수 중인 대회');
  expect(badge).toHaveAttribute('data-phase', 'open');
  expect(badge).toHaveClass('bg-accent-soft', 'px-3');
  expect(badge).not.toHaveClass('px-2');
});
