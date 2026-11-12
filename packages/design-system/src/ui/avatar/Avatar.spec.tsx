import { createRef } from 'react';

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { colorModes, contrastRatio, resolveColor } from '../../test/color-tokens';
import { Badge } from '../badge/Badge';
import { Avatar, type IAvatarProps } from './Avatar';

type TAvatarTone = NonNullable<IAvatarProps['tone']>;

const tones: TAvatarTone[] = ['brand', 'accent', 'outline'];
// 아바타 크기(caption·label·title)와 배지(micro)의 글자 크기 클래스는 색이 아니다.
const textSizes = new Set(['micro', 'caption', 'label', 'title']);

/** 요소의 바탕·글자·테두리 색 클래스 */
function colorClasses(element: Element | null) {
  const classes = [...(element?.classList ?? [])];
  return {
    background: classes.find((name) => name.startsWith('bg-'))?.slice(3),
    foreground: classes
      .filter((name) => name.startsWith('text-'))
      .map((name) => name.slice(5))
      .find((name) => !textSizes.has(name)),
    border: classes.filter((name) => name.startsWith('border')),
  };
}

it('native props와 ref를 Root에 전달하면서 장식으로 숨겨야 한다', () => {
  const ref = createRef<HTMLSpanElement>();
  const { container } = render(<Avatar ref={ref} name="노을" title="노을" data-user-id="u1" size="sm" />);
  const avatar = container.firstElementChild;
  expect(ref.current).toBe(avatar);
  expect(avatar).toHaveAttribute('title', '노을');
  expect(avatar).toHaveAttribute('data-user-id', 'u1');
  expect(avatar).toHaveAttribute('aria-hidden', 'true');
  expect(avatar).toHaveTextContent('노');
});

describe('Avatar 모양과 색', () => {
  it('shape·tone을 정하지 않은 기존 호출부는 원형 brand 아바타를 그대로 그려야 한다', () => {
    const avatar = render(<Avatar name="노을" />).container.firstElementChild;
    expect(avatar).toHaveClass('rounded-full', 'bg-brand-soft', 'text-brand-strong', 'size-10', 'text-label');
    expect(avatar).not.toHaveClass('border');
  });

  it('그룹은 테두리 있는 둥근 사각형, 사람은 accent 원으로 그리고 className의 크기가 variant 크기를 대신해야 한다', () => {
    const { container } = render(
      <>
        <Avatar name="우리 웃음" shape="square" tone="outline" size="lg" className="size-12" />
        <Avatar name="노을" tone="accent" size="sm" />
      </>,
    );
    const [group, person] = container.children;
    expect(group).toHaveClass('rounded-card', 'border', 'border-line', 'bg-sunken', 'text-ink', 'size-12');
    expect(group).not.toHaveClass('rounded-full');
    expect(group).not.toHaveClass('bg-brand-soft');
    expect(group).not.toHaveClass('size-16');
    expect(person).toHaveClass('rounded-full', 'bg-accent-soft', 'text-accent-ink');
    expect(person).not.toHaveClass('border');
    expect(person).not.toHaveClass('bg-brand-soft');
  });

  it('작은 사각형은 원과 구분되도록 card보다 작은 모서리를 써야 한다', () => {
    const avatar = render(<Avatar name="우리 웃음" shape="square" size="sm" />).container.firstElementChild;
    expect(avatar).toHaveClass('rounded-control');
    expect(avatar).not.toHaveClass('rounded-card');
  });

  it.each(tones)('%s 아바타는 같은 이름의 배지와 같은 색이어야 한다', (tone) => {
    const { container } = render(
      <>
        <Avatar name="노을" tone={tone} />
        <Badge tone={tone}>노을</Badge>
      </>,
    );
    const [avatar, badge] = [...container.children].map((element) => colorClasses(element));
    // outline 아바타는 사진이 비는 자리라 바탕만 배지의 surface 대신 sunken이다.
    expect(avatar).toEqual(tone === 'outline' ? { ...badge, background: 'sunken' } : badge);
  });

  it.each(tones)('%s 아바타의 첫 글자는 모든 모드에서 4.5:1 이상이어야 한다', (tone) => {
    const { background, foreground } = colorClasses(
      render(<Avatar name={tone} tone={tone} />).container.firstElementChild,
    );
    if (!background || !foreground) throw new Error(`${tone} 아바타의 색 클래스를 찾지 못했습니다.`);
    for (const mode of colorModes) {
      expect
        .soft(
          contrastRatio(resolveColor(foreground, mode), resolveColor(background, mode)),
          `${mode}: text-${foreground} / bg-${background}`,
        )
        .toBeGreaterThanOrEqual(4.5);
    }
  });
});
