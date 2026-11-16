import type { ReactElement } from 'react';

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { locales } from '@/i18n/routing';
import { siteUrl } from '@/shared/config/site';
import { pageMetadata } from '@/shared/lib/seo/metadata';

import { GET } from './route';

const drawn = vi.hoisted(() => [] as ReactElement[]);
vi.mock('next/og', () => ({
  ImageResponse: class {
    constructor(element: ReactElement) {
      drawn.push(element);
    }
  },
}));

describe('multilingual SEO', () => {
  it('draws the default share image without text because every language shares it', () => {
    for (const locale of locales)
      expect(pageMetadata(locale, 'home').openGraph?.images).toEqual([
        expect.objectContaining({ url: `${siteUrl.origin}/opengraph-image` }),
      ]);
    GET();
    expect(drawn).toHaveLength(1);
    const { container } = render(drawn[0]);
    // Korean share previews used to show the English site title drawn here.
    expect(container.textContent).toBe('');
    expect(container.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
  });
});
