import { createRef } from 'react';

import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { Mention } from './Mention';

it('native span props와 ref를 전달해야 한다', () => {
  const ref = createRef<HTMLSpanElement>();
  render(<Mention ref={ref} nickname="노을" title="노을님에게 답글" data-user-id="u1" />);
  const mention = screen.getByText('@노을');
  expect(ref.current).toBe(mention);
  expect(mention).toHaveAttribute('title', '노을님에게 답글');
  expect(mention).toHaveAttribute('data-user-id', 'u1');
});
