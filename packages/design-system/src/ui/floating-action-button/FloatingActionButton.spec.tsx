import { StrictMode } from 'react';

import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FloatingActionButton } from './FloatingActionButton';

describe('FloatingActionButton', () => {
  it('아이콘과 글자를 하나의 이름으로 읽고 폼 안에서도 제출하지 않아야 한다', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onSubmit = vi.fn((event) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <FloatingActionButton label="그룹 만들기" onClick={onClick} />
      </form>,
    );
    const button = screen.getByRole('button', { name: '그룹 만들기' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button.querySelector('svg')).toBeInTheDocument();
    await user.tab();
    await user.keyboard('{Enter} ');
    expect(onClick).toHaveBeenCalledTimes(2);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('compact를 바꿔도 접근성 이름·포커스와 앱 marker를 보존해야 한다', async () => {
    const user = userEvent.setup();
    const props = { label: '新しいグループを作成', onClick: vi.fn() };
    const { rerender } = render(
      <FloatingActionButton {...props} data-compose-entry="group" data-scrolling="false" />,
    );
    const button = screen.getByRole('button', { name: props.label });
    expect(button).toHaveAttribute('data-compact', 'false');
    await user.tab();
    rerender(<FloatingActionButton {...props} compact data-compose-entry="group" data-scrolling="true" />);
    expect(button).toHaveFocus();
    expect(button).toHaveAccessibleName(props.label);
    expect(button).toHaveAttribute('data-compact', 'true');
    expect(button).toHaveAttribute('data-compose-entry', 'group');
    expect(button).toHaveAttribute('data-scrolling', 'true');
  });

  it('비활성 상태는 클릭과 키보드 활성화를 막아야 한다', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<FloatingActionButton label="글쓰기" onClick={onClick} disabled />);
    const button = screen.getByRole('button', { name: '글쓰기' });
    expect(button).toBeDisabled();
    await user.click(button);
    await user.tab();
    await user.keyboard('{Enter} ');
    expect(onClick).not.toHaveBeenCalled();
    expect(button).not.toHaveFocus();
  });

  it('앱의 위치 클래스와 팝업 설명을 전달하고 사용자 아이콘은 장식이어야 한다', () => {
    render(
      <>
        <p id="compose-help">공개할 대상을 선택합니다.</p>
        <FloatingActionButton
          label="새 글 쓰기"
          onClick={vi.fn()}
          className="fixed right-4 bottom-4"
          aria-haspopup="dialog"
          aria-expanded={false}
          aria-controls="compose-dialog"
          aria-describedby="compose-help"
          icon={<svg role="img" aria-label="문서 아이콘" />}
        />
      </>,
    );
    const button = screen.getByRole('button', { name: '새 글 쓰기' });
    expect(button).toHaveClass('fixed', 'right-4', 'bottom-4');
    expect(button).not.toHaveClass('relative');
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'compose-dialog');
    expect(button).toHaveAccessibleDescription('공개할 대상을 선택합니다.');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('gradient 변형은 브랜드 그라데이션과 같은 색 그림자를 쓰고 기본은 accent를 유지해야 한다', () => {
    const { rerender } = render(<FloatingActionButton label="글쓰기" onClick={vi.fn()} />);
    const button = screen.getByRole('button', { name: '글쓰기' });
    expect(button).toHaveClass('bg-accent', 'shadow-toast');
    expect(button).not.toHaveClass('bg-brand-gradient');
    rerender(<FloatingActionButton label="글쓰기" variant="gradient" onClick={vi.fn()} />);
    expect(button).toHaveClass('bg-brand-gradient', 'text-on-accent', 'shadow-glow');
    expect(button).not.toHaveClass('bg-accent', 'shadow-toast');
  });

  it('React callback ref의 StrictMode 재연결과 제거 cleanup을 보존해야 한다', () => {
    const cleanup = vi.fn();
    const ref = vi.fn((node: HTMLButtonElement | null) => {
      if (node) return cleanup;
    });
    const { unmount } = render(
      <StrictMode>
        <FloatingActionButton label="글쓰기" onClick={vi.fn()} ref={ref} />
      </StrictMode>,
    );
    const button = screen.getByRole('button', { name: '글쓰기' });
    expect(ref).toHaveBeenCalledWith(button);
    const attached = ref.mock.calls.filter(([node]) => node === button).length;
    expect(cleanup).toHaveBeenCalledTimes(attached - 1);
    unmount();
    expect(cleanup).toHaveBeenCalledTimes(attached);
  });
});
