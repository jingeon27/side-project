import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect, vi } from 'vitest';

import type {} from '@testing-library/jest-dom/vitest';

expect.extend(matchers);

afterEach(cleanup);

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverStub);

if (typeof window.matchMedia !== 'function') {
  vi.stubGlobal('matchMedia', (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

// jsdom에서는 외부 SVG 플레이어를 대체하고 실제 재생은 브라우저 레인에서 확인한다.
vi.mock('lottie-web/build/player/lottie_light', () => ({
  default: {
    loadAnimation: vi.fn(() => ({
      isLoaded: false,
      play: vi.fn(),
      pause: vi.fn(),
      destroy: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  },
}));
