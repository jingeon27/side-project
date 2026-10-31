import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('label은 live region의 숨긴 글자로 넣어 읽히게 해야 한다', () => {
    render(<Spinner label="사진 올리는 중" />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('사진 올리는 중');
    expect(status).not.toHaveAttribute('aria-label');
    expect(screen.getByText('사진 올리는 중')).toHaveClass('sr-only');
  });

  it('label이 없으면 장식으로 숨기고 live region을 만들지 않아야 한다', () => {
    const { container } = render(<Spinner className="size-4" />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstElementChild).toHaveClass('size-4');
  });
});
