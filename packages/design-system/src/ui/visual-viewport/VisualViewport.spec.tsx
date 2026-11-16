import { StrictMode } from 'react';

import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VisualViewport } from './VisualViewport';

afterEach(() => vi.unstubAllGlobals());

describe('visible viewport synchronization', () => {
  it('tracks keyboard resize and panning and restores styles on unmount in StrictMode', () => {
    const viewport = Object.assign(new EventTarget(), { height: 420, offsetTop: 16 });
    vi.stubGlobal('visualViewport', viewport);
    const root = document.documentElement;
    const { unmount } = render(
      <StrictMode>
        <VisualViewport />
      </StrictMode>,
    );
    expect(root.style.getPropertyValue('--visual-viewport-height')).toBe('420px');
    expect(root.style.getPropertyValue('--visual-viewport-top')).toBe('16px');
    Object.assign(viewport, { height: 360, offsetTop: 24 });
    viewport.dispatchEvent(new Event('resize'));
    viewport.dispatchEvent(new Event('scroll'));
    expect(root.style.getPropertyValue('--visual-viewport-height')).toBe('360px');
    expect(root.style.getPropertyValue('--visual-viewport-top')).toBe('24px');
    unmount();
    viewport.dispatchEvent(new Event('resize'));
    expect(root.style.getPropertyValue('--visual-viewport-height')).toBe('');
    expect(root.style.getPropertyValue('--visual-viewport-top')).toBe('');
  });

  it('falls back to the window height when visualViewport is unavailable', () => {
    vi.stubGlobal('visualViewport', undefined);
    const { unmount } = render(<VisualViewport />);
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-height')).toBe(
      `${window.innerHeight}px`,
    );
    unmount();
  });
});
