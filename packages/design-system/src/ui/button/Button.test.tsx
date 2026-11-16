import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { hoverBackgroundSelectors, matchingRules, specificity, winningValue } from '../../test/css-cascade';
import { Button } from './Button';

const variants = ['primary', 'secondary', 'ghost', 'danger', 'accent'] as const;

describe('Button hover', () => {
  // 잠긴 그룹 대회 투표 버튼(focusableWhenDisabled)과 진행 중 버튼은 native disabled가 아니라서
  // disabled:pointer-events-none이 걸리지 않았고, 마우스를 올리면 누를 수 있는 것처럼 바탕이 바뀌었다.
  it.each(variants)(
    '%s는 진행 중이거나 포커스를 남긴 비활성 상태면 마우스를 올려도 바탕이 바뀌지 않아야 한다',
    async (variant) => {
      render(
        <>
          <Button variant={variant}>저장하기</Button>
          <Button variant={variant} loading>
            저장 중
          </Button>
          <Button variant={variant} disabled focusableWhenDisabled>
            투표 완료
          </Button>
        </>,
      );
      const enabled = screen.getByRole('button', { name: '저장하기' });
      expect(await hoverBackgroundSelectors(enabled)).not.toEqual([]);
      for (const name of ['저장 중', '투표 완료']) {
        const button = screen.getByRole('button', { name });
        expect(button).not.toHaveAttribute('disabled');
        expect(button).toHaveAttribute('aria-disabled', 'true');
        expect(await hoverBackgroundSelectors(button)).toEqual([]);
      }
    },
  );

  // 공통 hover 규칙은 임의 변형이라 생성 CSS에서 맨 뒤에 나온다. hover: 하나와 같은 0,2,0이면 같은 명시도의 호출부
  // 규칙(aria-pressed:bg-*, hover:bg-*)과 앱이 @utility로 정한 `.x:hover`를 순서로 이긴다. 조건이 하나라도 붙은
  // 규칙에는 지도록 클래스 하나(0,1,0)로 둔다. hover: 대신 쓰므로 터치 기기 제외도 직접 지켜야 한다.
  it.each(variants)(
    '%s의 hover 바탕 규칙은 마우스가 있는 기기에서만 클래스 하나의 명시도로 걸려야 한다',
    async (variant) => {
      render(<Button variant={variant}>저장하기</Button>);
      const button = screen.getByRole('button', { name: '저장하기' });
      const selectors = await hoverBackgroundSelectors(button);
      expect(selectors).not.toEqual([]);
      expect(selectors.map(specificity)).toEqual(selectors.map(() => [0, 1, 0]));
      // 터치 기기는 손을 뗀 뒤에도 :hover가 남아 누른 버튼이 회색으로 남는다.
      expect(await hoverBackgroundSelectors(button, [])).toEqual([]);
    },
  );

  // Game Feedback 서식 도구 막대와 피식 게시물 카드 좋아요는 ghost 위에 aria-pressed로 바탕을 정한다. 공통 hover가
  // 0,2,0이었을 때는 생성 CSS에서 뒤에 나와, 켜진 버튼에 마우스를 올리면 회색(neutral-soft)이 됐다.
  it.each(variants)('%s 위에 aria-pressed로 정한 바탕은 마우스를 올려도 유지되어야 한다', async (variant) => {
    render(
      <Button variant={variant} aria-pressed className="aria-pressed:bg-accent-soft">
        굵게
      </Button>,
    );
    const button = screen.getByRole('button', { name: '굵게' });
    const resting = await matchingRules(button);
    const hovered = await matchingRules(button, { pseudo: ['hover'] });
    expect(winningValue(resting, 'background-color')).toBe('var(--color-accent-soft)');
    expect(winningValue(hovered, 'background-color')).toBe('var(--color-accent-soft)');
  });
});
