import type { Locale } from '@/i18n/routing';

import type { categories } from './categories';

export type { Locale };
export type Category = (typeof categories)[number];
export type TocEntry = { id: string; title: string; level: 2 | 3 };
export type Article = {
  id: string;
  locale: Locale;
  title: string;
  slug: string;
  description: string;
  keywords: string[];
  category: Category;
  tags: string[];
  publishedAt: string;
  updatedAt?: string;
  coverImage?: string;
  socialImage?: string;
  readingMinutes: number;
  toc: TocEntry[];
  translations: Partial<Record<Locale, string>>;
};
