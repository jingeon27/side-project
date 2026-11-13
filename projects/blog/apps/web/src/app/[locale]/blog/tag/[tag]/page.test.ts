import { describe, expect, it } from 'vitest';

import { locales } from '@/i18n/routing';
import { getIndexedTags } from '@/shared/article/lib/get-articles';
import { pageMetadata } from '@/shared/lib/seo/metadata';

import { generateMetadata } from './page';

describe('tag page metadata', () => {
  it.each(locales)('describes each indexed %s tag page by its own tag', async (locale) => {
    // Indexed tag pages used to repeat the /blog description in search results.
    const blogDescription = pageMetadata(locale, 'blog').description;
    const descriptions = await Promise.all(
      getIndexedTags(locale).map(async (tag) => {
        const metadata = await generateMetadata({ params: Promise.resolve({ locale, tag }) });
        expect(metadata.description, tag).toContain(`#${tag}`);
        expect(metadata.openGraph?.description, tag).toBe(metadata.description);
        return metadata.description;
      }),
    );
    expect(descriptions.length).toBeGreaterThan(0);
    expect(descriptions).not.toContain(blogDescription);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });
});
