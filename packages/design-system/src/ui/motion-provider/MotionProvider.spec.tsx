import { useContext } from 'react';
import { renderToString } from 'react-dom/server';

import { act, render, screen, waitFor } from '@testing-library/react';
import { motion, MotionConfigContext } from 'motion/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { m } from '../../lib/motion';
import { MotionProvider } from './MotionProvider';

function Configuration() {
  const config = useContext(MotionConfigContext);
  return (
    <output>{JSON.stringify({ reducedMotion: config.reducedMotion, transition: config.transition })}</output>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('MotionProvider', () => {
  it('기본 전환과 사용자 설정을 공유하고 기기 모션 감소에서는 duration을 0으로 바꿔야 한다', () => {
    const media = Object.assign(new EventTarget(), {
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }) satisfies MediaQueryList;
    vi.spyOn(window, 'matchMedia').mockReturnValue(media);
    render(
      <MotionProvider>
        <Configuration />
      </MotionProvider>,
    );
    expect(JSON.parse(screen.getByRole('status').textContent ?? '')).toEqual({
      reducedMotion: 'user',
      transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
    });
    act(() => {
      media.matches = true;
      media.dispatchEvent(new Event('change'));
    });
    expect(JSON.parse(screen.getByRole('status').textContent ?? '')).toEqual({
      reducedMotion: 'user',
      transition: { duration: 0 },
    });
    expect(
      renderToString(
        <MotionProvider>
          <Configuration />
        </MotionProvider>,
      ),
    ).toContain('duration&quot;:0');
  });

  it('래퍼 DOM 없이 m 컴포넌트에 LazyMotion 애니메이션 기능을 제공해야 한다', async () => {
    const view = render(
      <MotionProvider>
        <m.div data-testid="motion-child" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      </MotionProvider>,
    );
    const child = screen.getByTestId('motion-child');
    expect(view.container.children).toHaveLength(1);
    expect(view.container.firstElementChild).toBe(child);
    await waitFor(() => expect(child).toHaveStyle({ opacity: '1' }));
  });

  it('strict 모드에서는 LazyMotion 안의 전체 motion 컴포넌트를 거부해야 한다', () => {
    expect(() =>
      render(
        <MotionProvider>
          <motion.div />
        </MotionProvider>,
      ),
    ).toThrow(/LazyMotion/);
  });
});
