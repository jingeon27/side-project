import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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
