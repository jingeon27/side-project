import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SegmentedControl } from './SegmentedControl';

const SORT_OPTIONS = [
  { value: 'latest', label: '최신순' },
  { value: 'popular', label: '좋아요순' },
] as const;

type TSort = (typeof SORT_OPTIONS)[number]['value'];

function SortControl({ onChange }: { onChange: (value: TSort) => void }) {
  const [sort, setSort] = useState<TSort>('latest');
  return (
    <SegmentedControl
      label="사진 정렬"
      value={sort}
      options={SORT_OPTIONS}
      onValueChange={(value) => {
        setSort(value);
        onChange(value);
      }}
    />
  );
}

describe('SegmentedControl', () => {
  it('이름 있는 묶음 안에서 지금 고른 칸만 눌린 상태여야 한다', () => {
    render(<SortControl onChange={vi.fn()} />);
    expect(screen.getByRole('group', { name: '사진 정렬' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '최신순' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '좋아요순' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('화살표 키로 칸을 옮기고 Enter·Space로 골라야 한다', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SortControl onChange={onChange} />);

    await user.tab();
    expect(screen.getByRole('button', { name: '최신순' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: '좋아요순' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('popular');
    expect(screen.getByRole('button', { name: '좋아요순' })).toHaveAttribute('aria-pressed', 'true');

    await user.keyboard('{ArrowLeft}');
    await user.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith('latest');
  });

  it('이미 고른 칸을 다시 눌러도 선택이 비지 않아야 한다', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SortControl onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: '최신순' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '최신순' })).toHaveAttribute('aria-pressed', 'true');
  });
});
