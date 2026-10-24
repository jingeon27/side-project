import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from '../badge';
import { Skeleton } from '../skeleton';
import { Spinner } from '../spinner';
import { StickyCta } from '../sticky-cta';
import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('사진이 없으면 이름의 첫 글자(이모지 포함)를 보여 주고 보조기기에서는 숨겨야 한다', () => {
    const { container, rerender } = render(<Avatar name=" 김진건" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container).toHaveTextContent('김');

    rerender(<Avatar name="📸사진왕" />);
    expect(container).toHaveTextContent('📸');
  });
});

describe('작은 표시 요소', () => {
  it('배지는 색과 함께 글자로 뜻을 전해야 한다', () => {
    render(<Badge tone="gold">1위</Badge>);
    expect(screen.getByText('1위')).toBeInTheDocument();
  });

  it('스켈레톤은 숨기고, 이름 있는 스피너만 진행 상태로 읽혀야 한다', () => {
    const { container } = render(
      <>
        <Skeleton className="h-6" />
        <Spinner label="사진 올리는 중" />
        <Spinner />
      </>,
    );
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    // live region은 aria-label이 아니라 내용을 읽으므로 숨긴 글자로 확인한다.
    expect(screen.getByRole('status')).toHaveTextContent('사진 올리는 중');
  });

  it('하단 CTA는 토스트가 비켜 설 수 있게 표시를 남겨야 한다', () => {
    render(
      <StickyCta>
        <button type="button">사진 제출하기</button>
      </StickyCta>,
    );
    expect(
      screen.getByRole('button', { name: '사진 제출하기' }).closest('[data-sticky-cta]'),
    ).toHaveAttribute('data-sticky-cta');
  });
});
