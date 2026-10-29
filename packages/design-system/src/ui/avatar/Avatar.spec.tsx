import { createRef } from 'react';

import { render } from '@testing-library/react';
import { expect, it } from 'vitest';

import { Avatar } from './Avatar';

it('native props와 ref를 Root에 전달하면서 장식으로 숨겨야 한다', () => {
  const ref = createRef<HTMLSpanElement>();
  const { container } = render(<Avatar ref={ref} name="노을" title="노을" data-user-id="u1" size="sm" />);
  const avatar = container.firstElementChild;
  expect(ref.current).toBe(avatar);
  expect(avatar).toHaveAttribute('title', '노을');
  expect(avatar).toHaveAttribute('data-user-id', 'u1');
  expect(avatar).toHaveAttribute('aria-hidden', 'true');
  expect(avatar).toHaveTextContent('노');
});
