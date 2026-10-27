import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { IconButton, iconButtonVariants } from './IconButton';
import { IconButtonLink } from './IconButtonLink';

describe('IconButton', () => {
  it('진행 중에는 아이콘을 진행 표시로 바꾸고 이름·포커스를 유지하며 누를 수 없어야 한다', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <IconButton label="공유하기" variant="accent" loading onClick={onClick}>
        <svg data-testid="share-icon" aria-hidden />
      </IconButton>,
    );
    const button = screen.getByRole('button', { name: '공유하기' });
    expect(screen.queryByTestId('share-icon')).not.toBeInTheDocument();
    expect(button.firstElementChild).toHaveClass('animate-spin');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveClass('bg-accent', 'text-on-accent', 'size-touch', 'rounded-full');
    await user.tab();
    expect(button).toHaveFocus();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('primary는 brand 토큰을 쓰고 iconButtonVariants와 같은 클래스를 내야 한다', () => {
    render(
      <IconButton label="추가하기" variant="primary">
        <svg aria-hidden />
      </IconButton>,
    );
    const button = screen.getByRole('button', { name: '추가하기' });
    expect(button).toHaveClass('bg-brand', 'text-on-brand');
    for (const name of iconButtonVariants({ variant: 'primary' }).split(' '))
      expect(button).toHaveClass(name);
  });

  it('IconButtonLink는 같은 모양의 이름 있는 링크여야 한다', () => {
    render(
      <IconButtonLink href="/settings" label="설정" variant="soft">
        <svg aria-hidden />
      </IconButtonLink>,
    );
    const link = screen.getByRole('link', { name: '설정' });
    expect(link).toHaveAttribute('href', '/settings');
    expect(link).toHaveAttribute('title', '설정');
    expect(link.className).toBe(iconButtonVariants({ variant: 'soft' }));
  });
});
