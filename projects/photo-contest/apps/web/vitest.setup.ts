import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, vi } from 'vitest';

import type {} from '@testing-library/jest-dom/vitest';

// jest-dom의 vitest 진입점은 자체 import한 expect를 확장해 러너의 expect와 어긋날 수 있어 직접 등록한다.
expect.extend(matchers);

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

// jsdom에 없는 브라우저 API. Base UI의 측정·미디어 쿼리 코드가 호출만 할 수 있으면 된다.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class IntersectionObserverStub {
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

const installBrowserApis = () => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);

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
};

installBrowserApis();
// 개별 테스트의 unstubAllGlobals가 브라우저 기본 대역까지 지우므로 매번 복구한다.
beforeEach(installBrowserApis);

window.scrollTo = () => undefined;
Element.prototype.scrollIntoView = () => undefined;

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
