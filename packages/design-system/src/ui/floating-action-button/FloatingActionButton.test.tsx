import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { matchingRules, winningValue } from '../../test/css-cascade';
import { FloatingActionButton } from './FloatingActionButton';

const mouse = ['(hover: hover)'];

async function pressedRules(media: string[]) {
  render(<FloatingActionButton label="글쓰기" onClick={vi.fn()} />);
  return matchingRules(screen.getByRole('button', { name: '글쓰기' }), {
    pseudo: ['hover', 'active'],
    media,
  });
}

describe('FloatingActionButton 누름', () => {
  // 모션 감소 덮어쓰기(.cls:active, 0,2,0)가 Button의 눌림 규칙(.cls:active:not(...), 0,3,0)에 졌다.
  // 그래서 모션 감소 설정에서도 누르면 1px 내려가고 0.98로 줄었다.
  it('모션 감소 설정에서는 눌러도 내려가거나 줄어들지 않아야 한다', async () => {
    const pressed = await pressedRules([...mouse, '(prefers-reduced-motion: reduce)']);
    expect(winningValue(pressed, '--tw-translate-y')).toBe('0px');
    expect(winningValue(pressed, 'scale')).toBe('var(--tw-scale-x) var(--tw-scale-y)');
    expect(winningValue(pressed, '--tw-scale-x')).toBe('100%');
    expect(winningValue(pressed, '--tw-scale-y')).toBe('100%');
  });

  it('모션 감소 설정이 아니면 Button처럼 누를 때 내려가고 줄어들어야 한다', async () => {
    const pressed = await pressedRules(mouse);
    expect(winningValue(pressed, '--tw-translate-y')).toBe('1px');
    expect(winningValue(pressed, 'scale')).toBe('0.98');
  });
});
