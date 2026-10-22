import { describe, expect, it } from 'vitest';

import { colorModes, contrastRatio, readStyle, resolveColor } from '../test/color-tokens';

const pageBackgrounds = ['canvas', 'surface', 'sunken', 'neutral-soft', 'brand-soft'];

describe('포커스 링 대비', () => {
  it('전역 :focus-visible 링은 focus-ring 토큰을 써야 한다', () => {
    expect(readStyle('base.css')).toMatch(
      /:focus-visible\s*{\s*outline:\s*3px solid var\(--color-focus-ring\)/,
    );
  });

  it.each(colorModes)('%s 모드에서 링이 바탕과 3:1 이상이어야 한다(WCAG 1.4.11)', (mode) => {
    const ring = resolveColor('focus-ring', mode);
    for (const background of pageBackgrounds) {
      expect
        .soft(contrastRatio(ring, resolveColor(background, mode)), `${background}`)
        .toBeGreaterThanOrEqual(3);
    }
  });

  it('다크 모드는 기존 accent 링을 유지해야 한다', () => {
    expect(resolveColor('focus-ring', 'dark')).toBe(resolveColor('accent', 'dark'));
  });
});
