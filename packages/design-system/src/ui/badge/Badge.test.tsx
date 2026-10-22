import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { colorModes, contrastRatio, resolveColor } from '../../test/color-tokens';
import { Badge, type TBadgeTone } from './Badge';

const tones: TBadgeTone[] = ['brand', 'accent', 'neutral', 'danger', 'info', 'gold', 'silver', 'bronze'];
const textSizes = new Set(['micro']);

function badgeColors(tone: TBadgeTone) {
  render(<Badge tone={tone}>{tone}</Badge>);
  const classes = screen.getByText(tone).className.split(/\s+/);
  const background = classes.find((name) => name.startsWith('bg-'))?.slice(3);
  const foreground = classes
    .filter((name) => name.startsWith('text-'))
    .map((name) => name.slice(5))
    .find((name) => !textSizes.has(name));
  if (!background || !foreground) throw new Error(`${tone} 배지의 색 클래스를 찾지 못했습니다.`);
  return { background, foreground };
}

describe('Badge 대비', () => {
  it.each(tones)('%s 배지 글자는 모든 모드에서 4.5:1 이상이어야 한다', (tone) => {
    const { background, foreground } = badgeColors(tone);
    for (const mode of colorModes) {
      expect
        .soft(
          contrastRatio(resolveColor(foreground, mode), resolveColor(background, mode)),
          `${mode}: text-${foreground} / bg-${background}`,
        )
        .toBeGreaterThanOrEqual(4.5);
    }
  });

  it('메달 배지는 다크 모드에서도 고정 글자색을 써야 한다', () => {
    for (const tone of ['gold', 'silver', 'bronze'] as const) {
      expect(badgeColors(tone).foreground).toBe('on-medal');
    }
    expect(resolveColor('on-medal', 'dark')).toBe(resolveColor('on-medal', 'light'));
  });
});
