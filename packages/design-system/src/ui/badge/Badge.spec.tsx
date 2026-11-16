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

it('tone이 없으면 기존 neutral 배지를, outline이면 같은 모양에 surface 바탕과 line 테두리를 그려야 한다', () => {
  render(
    <>
      <Badge>진행 중</Badge>
      <Badge tone="outline">공개</Badge>
    </>,
  );
  const neutral = screen.getByText('진행 중');
  expect(neutral).toHaveClass('rounded-badge', 'bg-neutral-soft', 'text-muted');
  expect(neutral).not.toHaveClass('border');
  const outline = screen.getByText('공개');
  expect(outline).toHaveClass('rounded-badge', 'border', 'border-line', 'bg-surface', 'text-ink');
});
