import { createRef } from 'react';

import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { Spinner } from './Spinner';

it('native props와 ref를 전달하고 role은 label로만 정해야 한다', () => {
  const ref = createRef<HTMLSpanElement>();
  render(<Spinner ref={ref} id="upload-progress" data-state="uploading" label="올리는 중" />);
  const status = screen.getByRole('status');
  expect(ref.current).toBe(status);
  expect(status).toHaveAttribute('id', 'upload-progress');
  expect(status).toHaveAttribute('data-state', 'uploading');
});
