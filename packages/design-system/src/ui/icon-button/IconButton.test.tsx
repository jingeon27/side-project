import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { hoverBackgroundSelectors, matchingRules, specificity, winningValue } from '../../test/css-cascade';
import { IconButton } from './IconButton';

const variants = ['ghost', 'soft', 'primary', 'accent'] as const;

describe('IconButton hover', () => {
  // IconButton은 ghost Button 위에 바탕을 얹는다. ghost와 IconButton의 hover에는 비활성 조건이 없어서
  // 진행 중이거나 포커스를 남긴 비활성 아이콘 버튼도 마우스를 올리면 누를 수 있는 것처럼 바탕이 바뀌었다.
  it.each(variants)(
    '%s는 진행 중이거나 포커스를 남긴 비활성 상태면 마우스를 올려도 바탕이 바뀌지 않아야 한다',
    async (variant) => {
      render(
        <>
          <IconButton label="공유하기" variant={variant}>
            <svg aria-hidden />
          </IconButton>
          <IconButton label="공유 중" variant={variant} loading>
            <svg aria-hidden />
          </IconButton>
          <IconButton label="공유 완료" variant={variant} disabled focusableWhenDisabled>
            <svg aria-hidden />
          </IconButton>
        </>,
      );
      const enabled = screen.getByRole('button', { name: '공유하기' });
      expect(await hoverBackgroundSelectors(enabled)).not.toEqual([]);
      for (const name of ['공유 중', '공유 완료']) {
        const button = screen.getByRole('button', { name });
        expect(button).not.toHaveAttribute('disabled');
        expect(button).toHaveAttribute('aria-disabled', 'true');
        expect(await hoverBackgroundSelectors(button)).toEqual([]);
      }
    },
  );

  it.each(variants)(
    '%s의 hover 바탕 규칙은 Button처럼 마우스가 있는 기기에서만 클래스 하나의 명시도로 걸려야 한다',
    async (variant) => {
      render(
        <IconButton label="공유하기" variant={variant}>
          <svg aria-hidden />
        </IconButton>,
      );
      const button = screen.getByRole('button', { name: '공유하기' });
      const selectors = await hoverBackgroundSelectors(button);
      expect(selectors).not.toEqual([]);
      expect(selectors.map(specificity)).toEqual(selectors.map(() => [0, 1, 0]));
      expect(await hoverBackgroundSelectors(button, [])).toEqual([]);
    },
  );

  // 피식 게시물 카드의 '더보기'는 className의 hover:bg-sunken으로 hover 바탕을 바꾼다. 공통 hover가 0,2,0이었을 때는
  // 수식어가 달라 tailwind-merge가 지우지 못했고 생성 CSS에서도 뒤에 나와 회색(neutral-soft)이 이겼다.
  it.each(variants)('%s의 hover 바탕은 호출부의 hover:bg-*가 덮어야 한다', async (variant) => {
    render(
      <IconButton label="더보기" variant={variant} className="hover:bg-sunken">
        <svg aria-hidden />
      </IconButton>,
    );
    const button = screen.getByRole('button', { name: '더보기' });
    const hovered = await matchingRules(button, { pseudo: ['hover'] });
    expect(winningValue(hovered, 'background-color')).toBe('var(--color-sunken)');
  });

  // 기반인 ghost의 hover·누름 바탕(neutral-soft)이 tailwind-merge에 지워지지 않고 남아서 accent(Game Feedback 검색
  // 제출 버튼)는 마우스를 올리거나 누르면 회색이 됐다. ghost와 수식어가 달라지면 다른 변형도 ghost 바탕이 남는다.
  it.each([
    ['ghost', 'var(--color-neutral-soft)'],
    ['soft', 'var(--color-neutral-soft)'],
    ['primary', 'var(--color-brand-strong)'],
    ['accent', 'var(--color-accent)'],
  ] as const)('%s는 마우스를 올리거나 누르는 동안 자기 바탕 %s를 써야 한다', async (variant, background) => {
    render(
      <IconButton label="공유하기" variant={variant}>
        <svg aria-hidden />
      </IconButton>,
    );
    const button = screen.getByRole('button', { name: '공유하기' });
    const hovered = await matchingRules(button, { pseudo: ['hover'] });
    const pressed = await matchingRules(button, { pseudo: ['hover', 'active'] });
    expect(winningValue(hovered, 'background-color')).toBe(background);
    expect(winningValue(pressed, 'background-color')).toBe(background);
  });

  it('accent는 바탕을 유지한 채 마우스를 올리면 조금, 누르면 더 어둡게 보여야 한다', async () => {
    render(
      <IconButton label="검색" variant="accent">
        <svg aria-hidden />
      </IconButton>,
    );
    const button = screen.getByRole('button', { name: '검색' });
    const hovered = await matchingRules(button, { pseudo: ['hover'] });
    const pressed = await matchingRules(button, { pseudo: ['hover', 'active'] });
    expect(winningValue(hovered, '--tw-brightness')).toBe('brightness(95%)');
    expect(winningValue(pressed, '--tw-brightness')).toBe('brightness(90%)');
  });
});
