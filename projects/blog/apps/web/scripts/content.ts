import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { compile } from '@mdx-js/mdx';
import GithubSlugger from 'github-slugger';
import { toString } from 'mdast-util-to-string';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { z } from 'zod';

import { parseContentDate } from '../src/shared/lib/date/content-date';

export const locales = ['ko', 'en'] as const;
export const categories = ['engineering', 'til', 'perspectives', 'misc'] as const;
export const slugSchema = z
  .string()
  .min(1)
  .regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u, 'Use letters, numbers, and single hyphens');
const dateSchema = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);
export const metaSchema = z
  .object({
    category: z.enum(categories),
    // Tags live in meta.json and are shown as-is in every locale, so they are English slugs.
    tags: z
      .array(
        z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Tags are shared by all locales: use lowercase ASCII slugs'),
      )
      .refine((tags) => new Set(tags).size === tags.length, 'Duplicate tags'),
    publishedAt: dateSchema,
    updatedAt: dateSchema.optional(),
    coverImage: z.string().startsWith('/images/').optional(),
    sourceUrl: z.url().optional(),
  })
  .strict()
  .refine(
    (meta) => !meta.updatedAt || parseContentDate(meta.updatedAt) >= parseContentDate(meta.publishedAt),
    'updatedAt precedes publishedAt',
  );
const seoBase = z.object({ title: z.string().trim().min(1), description: z.string().trim().min(1) });
export const seoSchema = z.object({
  site: seoBase.extend({ keywords: z.array(z.string().trim().min(1)) }),
  pages: z.object({ home: seoBase, blog: seoBase, about: seoBase }),
  posts: z.record(
    z.string(),
    seoBase.extend({ slug: slugSchema, keywords: z.array(z.string().trim().min(1)) }),
  ),
});
export const redirectSchema = z.array(
  z.object({ locale: z.enum(locales), from: slugSchema, to: slugSchema }).strict(),
);
export type Locale = (typeof locales)[number];
export type TocEntry = { id: string; title: string; level: 2 | 3 };
export type ContentArticle = z.infer<typeof metaSchema> &
  z.infer<typeof seoSchema>['posts'][string] & {
    id: string;
    locale: Locale;
    readingMinutes: number;
    toc: TocEntry[];
    translations: Partial<Record<Locale, string>>;
  };

const parser = unified().use(remarkParse).use(remarkMdx).use(remarkGfm);
export function analyzeMdx(source: string) {
  const tree = parser.parse(source);
  const slugger = new GithubSlugger();
  const toc: TocEntry[] = [];
  visit(tree, 'heading', (node) => {
    const title = toString(node);
    const id = slugger.slug(title);
    if (node.depth === 2 || node.depth === 3) toc.push({ id, title, level: node.depth });
  });
  // Use the visible prose for an estimate, excluding code and markup.
  const text = toString(tree);
  const korean = (text.match(/[가-힣]/g) ?? []).length;
  const words = text
    .replace(/[가-힣]/g, '')
    .split(/\s+/)
    .filter(Boolean).length;
  const readingMinutes = Math.max(1, Math.ceil(korean / 500 + words / 220));
  return { toc, readingMinutes, tree };
}

// Components registered in src/mdx-components.tsx. Unknown JSX would fail at render time.
export const mdxComponents = ['Summary', 'Decision', 'Callout', 'Figure', 'CodeBlock'] as const;
const allowedJsx = new Set<string>(mdxComponents);
const numericExpression = /^\s*-?\d+(?:\.\d+)?\s*$/;

/**
 * Keeps MDX to Markdown plus the registered components: ESM, JavaScript expressions, spread
 * props and unknown JSX are rejected. Numeric props such as `width={640}` stay allowed.
 * Returns JSX `src` values so they can be checked like Markdown images.
 */
export function validateMdxNodes(tree: ReturnType<typeof analyzeMdx>['tree'], label: string): string[] {
  const sources: string[] = [];
  visit(tree, (node) => {
    if (node.type === 'mdxjsEsm') throw new Error(`${label}: import/export is not allowed in MDX`);
    if (node.type === 'mdxFlowExpression' || node.type === 'mdxTextExpression')
      throw new Error(`${label}: JavaScript expressions are not allowed in MDX`);
    if (node.type !== 'mdxJsxFlowElement' && node.type !== 'mdxJsxTextElement') return;
    if (!node.name || !allowedJsx.has(node.name))
      throw new Error(`${label}: unsupported JSX <${node.name ?? ''}>. Use ${mdxComponents.join(', ')}`);
    for (const attribute of node.attributes) {
      if (attribute.type === 'mdxJsxExpressionAttribute')
        throw new Error(`${label}: spread props are not allowed on <${node.name}>`);
      const { value } = attribute;
      if (value && typeof value === 'object' && !numericExpression.test(value.value))
        throw new Error(`${label}: only numeric expression props are allowed on <${node.name}>`);
      if (attribute.name !== 'src') continue;
      if (typeof value !== 'string') throw new Error(`${label}: <${node.name} src> must be a string`);
      sources.push(value);
    }
  });
  return sources;
}

async function json(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, 'utf8'));
}
export const articleUrlPath = (article: Pick<ContentArticle, 'locale' | 'slug'>) =>
  `/${article.locale}/blog/${article.slug}`;

/**
 * Returns previously published article paths that are neither live nor a 301 source.
 * Changing a slug or unpublishing an article must keep its old path in content/redirects.json.
 */
export function findMissingRedirects(
  previous: readonly Pick<ContentArticle, 'locale' | 'slug'>[],
  next: readonly Pick<ContentArticle, 'locale' | 'slug'>[],
  redirects: readonly { source: string }[],
): string[] {
  const live = new Set(next.map(articleUrlPath));
  const redirected = new Set(redirects.map((redirect) => redirect.source));
  return [...new Set(previous.map(articleUrlPath))]
    .filter((urlPath) => !live.has(urlPath) && !redirected.has(urlPath))
    .sort();
}

export async function readContent(root: string) {
  const seo = Object.fromEntries(
    await Promise.all(
      locales.map(async (locale) => [
        locale,
        seoSchema.parse(await json(path.join(root, 'seo', `${locale}.json`))),
      ]),
    ),
  ) as Record<Locale, z.infer<typeof seoSchema>>;
  const postsDir = path.join(root, 'content/posts');
  const ids = (await readdir(postsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const idSet = new Set(ids);
  for (const locale of locales) {
    const slugs = new Set<string>();
    for (const [id, post] of Object.entries(seo[locale].posts)) {
      if (!idSet.has(id)) throw new Error(`${locale}: SEO references missing content ${id}`);
      if (slugs.has(post.slug)) throw new Error(`${locale}: duplicate slug ${post.slug}`);
      slugs.add(post.slug);
    }
  }
  const articles: ContentArticle[] = [];
  const imports: { id: string; locale: Locale }[] = [];
  for (const id of ids) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error(`Invalid content ID ${id}`);
    const dir = path.join(postsDir, id);
    const files = await readdir(dir);
    const meta = metaSchema.parse(await json(path.join(dir, 'meta.json')));
    const available = locales.filter((locale) => files.includes(`${locale}.mdx`));
    if (!available.length) throw new Error(`${id}: no MDX content`);
    const translations: Partial<Record<Locale, string>> = {};
    for (const locale of locales) {
      const post = seo[locale].posts[id];
      if (available.includes(locale) !== Boolean(post))
        throw new Error(`${id}/${locale}: MDX and SEO must both exist`);
      if (post) translations[locale] = post.slug;
    }
    if (meta.coverImage) await access(path.join(root, 'public', meta.coverImage));
    for (const locale of available) {
      const source = await readFile(path.join(dir, `${locale}.mdx`), 'utf8');
      if (!source.trim()) throw new Error(`${id}/${locale}: empty content`);
      await compile(source, { remarkPlugins: [remarkGfm] });
      const { toc, readingMinutes, tree } = analyzeMdx(source);
      const images = validateMdxNodes(tree, `${id}/${locale}`);
      visit(tree, 'image', (node) => {
        images.push(node.url);
      });
      for (const url of images) {
        if (url.startsWith('/images/')) await access(path.join(root, 'public', url));
        else if (!/^https:\/\//.test(url)) throw new Error(`${id}/${locale}: unresolved image ${url}`);
      }
      articles.push({ ...meta, ...seo[locale].posts[id]!, id, locale, toc, readingMinutes, translations });
      imports.push({ id, locale });
    }
  }
  articles.sort(
    (a, b) => parseContentDate(b.publishedAt) - parseContentDate(a.publishedAt) || a.id.localeCompare(b.id),
  );
  // Validate internal article references after building the complete index.
  const validPaths = new Set(articles.map(articleUrlPath));
  for (const { id, locale } of imports) {
    const source = await readFile(path.join(postsDir, id, `${locale}.mdx`), 'utf8');
    const { tree } = analyzeMdx(source);
    visit(tree, 'link', (node) => {
      const target = decodeURI(node.url.split('#')[0]!.split('?')[0]!);
      if (/^\/(ko|en)\/blog\/(?!category\/|tag\/).+/.test(target) && !validPaths.has(target))
        throw new Error(`${id}/${locale}: broken article link ${node.url}`);
    });
  }
  const explicitRedirects = redirectSchema.parse(await json(path.join(root, 'content/redirects.json')));
  const redirects: { source: string; destination: string; statusCode: 301 }[] = [];
  const seenSources = new Set<string>();
  for (const { locale, from, to } of explicitRedirects) {
    const source = `/${locale}/blog/${from}`;
    const destination = `/${locale}/blog/${to}`;
    if (
      source === destination ||
      validPaths.has(source) ||
      !validPaths.has(destination) ||
      seenSources.has(source)
    )
      throw new Error(`Invalid redirect ${source} → ${destination}`);
    seenSources.add(source);
    redirects.push({ source, destination, statusCode: 301 });
  }
  for (const article of articles) {
    if (!article.sourceUrl || article.locale !== 'ko') continue;
    const original = new URL(article.sourceUrl);
    if (original.hostname === 'jingeon27.tistory.com' && /^\/\d+$/.test(original.pathname)) {
      redirects.push({
        source: original.pathname,
        destination: `/${article.locale}/blog/${article.slug}`,
        statusCode: 301,
      });
    }
  }
  return { articles, imports, redirects };
}
