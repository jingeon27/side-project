import { useState } from 'react';

import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SegmentedControl, SegmentedControlItem } from './SegmentedControl';

function SortControl({ onChange }: { onChange: (value: string) => void }) {
  const [sort, setSort] = useState('latest');
  return (
    <SegmentedControl
      label="사진 정렬"
      value={sort}
      onValueChange={(value) => {
        setSort(value);
        onChange(value);
      }}
    >
      <SegmentedControlItem value="latest">최신순</SegmentedControlItem>
      <SegmentedControlItem value="popular">좋아요순</SegmentedControlItem>
    </SegmentedControl>
  );
}

describe('SegmentedControl', () => {
  it('이름 있는 묶음 안에서 지금 고른 칸만 눌린 상태여야 한다', () => {
    render(<SortControl onChange={() => undefined} />);
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
    // 정렬을 바꾸면 피드를 다시 불러오므로 포커스만 옮길 때는 고르지 않는다.
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '최신순' })).toHaveAttribute('aria-pressed', 'true');
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

  it('묶음은 Tab 한 번에 지나가고, 화살표로 옮긴 칸이 다음 Tab 정지점이 되어야 한다', async () => {
    const user = userEvent.setup();
    render(
      <>
        <SortControl onChange={() => undefined} />
        <button type="button">사진 올리기</button>
      </>,
    );
    const latest = screen.getByRole('button', { name: '최신순' });
    const popular = screen.getByRole('button', { name: '좋아요순' });

    await user.tab();
    expect(latest).toHaveAttribute('tabindex', '0');
    expect(popular).toHaveAttribute('tabindex', '-1');

    await user.keyboard('{ArrowRight}');
    expect(popular).toHaveAttribute('tabindex', '0');
    expect(latest).toHaveAttribute('tabindex', '-1');

    await user.tab();
    expect(screen.getByRole('button', { name: '사진 올리기' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(popular).toHaveFocus();
  });

  it('부른 쪽이 넘긴 값만 따르고, 바깥에서 값이 바뀔 때는 onValueChange를 부르지 않아야 한다', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const control = (value: string) => (
      <SegmentedControl label="사진 정렬" value={value} onValueChange={onValueChange}>
        <SegmentedControlItem value="latest">최신순</SegmentedControlItem>
        <SegmentedControlItem value="popular">좋아요순</SegmentedControlItem>
      </SegmentedControl>
    );
    const { rerender } = render(control('latest'));

    // 정렬은 주소(?sort)에 있다. 주소가 바뀌기 전까지 눌린 칸을 먼저 바꾸지 않는다.
    await user.click(screen.getByRole('button', { name: '좋아요순' }));
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('popular');
    expect(screen.getByRole('button', { name: '최신순' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '좋아요순' })).toHaveAttribute('aria-pressed', 'false');

    // 뒤로 가기처럼 바깥에서 주소가 바뀐 것은 사용자의 선택이 아니라 다시 알리지 않는다(정렬 변경 이벤트 중복 방지).
    rerender(control('popular'));
    expect(screen.getByRole('button', { name: '좋아요순' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '최신순' })).toHaveAttribute('aria-pressed', 'false');
    expect(onValueChange).toHaveBeenCalledOnce();
  });
});
