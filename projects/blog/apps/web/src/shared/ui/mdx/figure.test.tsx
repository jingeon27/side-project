import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Callout } from '@/shared/ui/mdx/callout';
import { Decision } from '@/shared/ui/mdx/decision';
import { Figure } from '@/shared/ui/mdx/figure';
import { Summary } from '@/shared/ui/mdx/summary';

describe('article reading aids', () => {
  it('renders structured MDX notes and figure captions with accessible alternative text', () => {
    render(
      <>
        <Summary>핵심 정리</Summary>
        <Decision>선택한 이유</Decision>
        <Callout>참고 사항</Callout>
        <Figure src="/images/test.png" alt="캐시 계층도" caption="서버와 클라이언트의 경계" />
      </>,
    );
    expect(screen.getByText('핵심 정리')).toBeVisible();
    expect(screen.getByText('선택한 이유')).toBeVisible();
    expect(screen.getByText('참고 사항')).toBeVisible();
    expect(screen.getByRole('img', { name: '캐시 계층도' })).toHaveAttribute('loading', 'lazy');
    expect(screen.getByText('서버와 클라이언트의 경계')).toBeVisible();
  });
});
