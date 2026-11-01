import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { getSchema } from '@tiptap/core';
import { describe, expect, it } from 'vitest';

import {
  RichTextDocumentSchema,
  richTextMediaReferences,
  richTextToPlainText,
} from '@game-feedback/contracts';

import { RichTextBody } from './RichTextBody';
import { richTextToTiptap, tiptapToRichText } from './tiptap-document';
import { createRichTextExtensions } from './tiptap-extensions';

describe('Tiptap persisted Delta compatibility', () => {
  it('survives the actual ProseMirror schema with all marks, empty lines and inline video', () => {
    const original = RichTextDocumentSchema.parse({
      ops: [
        { insert: '\n' },
        {
          insert: '기존 한글 링크',
          attributes: {
            bold: true,
            italic: true,
            underline: true,
            strike: true,
            link: 'HTTP://example.com/한글',
          },
        },
        { insert: { image: '/api/post-media/schema-image' } },
        { insert: ' 같은 문단 ' },
        { insert: { video: '/api/post-media/schema-video' } },
        { insert: '\n\n' },
        { insert: '목록 한 줄' },
        { insert: '\n', attributes: { list: 'ordered' } },
        { insert: '마지막 인용' },
        { insert: '\n', attributes: { blockquote: true } },
      ],
    });
    const schema = getSchema(createRichTextExtensions());
    const normalized = schema.nodeFromJSON(richTextToTiptap(original));
    expect(() => normalized.check()).not.toThrow();
    const converted = RichTextDocumentSchema.parse(tiptapToRichText(normalized.toJSON()));
    expect(richTextToPlainText(converted)).toBe(richTextToPlainText(original));
    expect(richTextMediaReferences(converted)).toEqual(richTextMediaReferences(original));
    expect(renderToStaticMarkup(createElement(RichTextBody, { body: '', document: converted }))).toBe(
      renderToStaticMarkup(createElement(RichTextBody, { body: '', document: original })),
    );
    expect(normalized.child(1).childCount).toBe(4);
    expect(normalized.firstChild?.content.size).toBe(0);
    expect(normalized.lastChild?.type.name).toBe('blockquote');
  });

  it('constrains actual list items to the flat shape supported by existing saved documents', () => {
    const schema = getSchema(createRichTextExtensions());
    const nested = schema.nodeFromJSON({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: '부모 항목' }] },
                { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
              ],
            },
          ],
        },
      ],
    });
    expect(() => nested.check()).toThrow();
  });

  it('prevents quote wrappers around headings and nested blocks that saved Delta cannot represent', () => {
    const schema = getSchema(createRichTextExtensions());
    const quoteWithHeading = schema.nodeFromJSON({
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '제목' }] }],
        },
      ],
    });
    const nestedQuote = schema.nodeFromJSON({
      type: 'doc',
      content: [{ type: 'blockquote', content: [{ type: 'blockquote', content: [{ type: 'paragraph' }] }] }],
    });
    expect(() => quoteWithHeading.check()).toThrow();
    expect(() => nestedQuote.check()).toThrow();
  });

  it('preserves existing formatting, blank lines, list grouping, quotes and Korean text', () => {
    const original = RichTextDocumentSchema.parse({
      ops: [
        { insert: '한글 제목' },
        { insert: '\n', attributes: { header: 2 } },
        { insert: '작은 제목' },
        { insert: '\n', attributes: { header: 3 } },
        {
          insert: '서식 있는 한글',
          attributes: {
            bold: true,
            italic: true,
            underline: true,
            strike: true,
            link: 'https://example.com/한글?q=테스트',
          },
        },
        { insert: ' <script>원문</script>\n\n' },
        { insert: '첫 번째' },
        { insert: '\n', attributes: { list: 'ordered' } },
        { insert: '두 번째' },
        { insert: '\n', attributes: { list: 'ordered' } },
        { insert: '글머리' },
        { insert: '\n', attributes: { list: 'bullet' } },
        { insert: '인용문' },
        { insert: '\n', attributes: { blockquote: true } },
        { insert: '\n' },
      ],
    });
    const converted = RichTextDocumentSchema.parse(tiptapToRichText(richTextToTiptap(original)));
    const html = renderToStaticMarkup(createElement(RichTextBody, { body: '', document: converted }));
    expect(richTextToPlainText(converted)).toBe(richTextToPlainText(original));
    expect(html).toBe(renderToStaticMarkup(createElement(RichTextBody, { body: '', document: original })));
    expect(html.match(/<ol>/g)).toHaveLength(1);
    expect(html.match(/<li>/g)).toHaveLength(3);
    expect(html).toContain('<p><br/></p>');
    expect(html).toContain('<h2>');
    expect(html).toContain('<h3>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<s><u><em><strong>서식 있는 한글</strong></em></u></s>');
    expect(html).not.toContain('<script>');
  });

  it('keeps inline media order and original text without introducing newlines on edit/save', () => {
    const original = RichTextDocumentSchema.parse({
      ops: [
        { insert: '사진 앞 ' },
        { insert: { image: '/api/post-media/image-legacy' } },
        { insert: ' 사진 뒤 동영상 앞 ' },
        { insert: { video: '/api/post-media/video-legacy' } },
        { insert: ' 동영상 뒤\n' },
        { insert: { video: '/api/post-media/video-alone' } },
        { insert: '\n마지막\n' },
      ],
    });
    const native = richTextToTiptap(original);
    const converted = RichTextDocumentSchema.parse(tiptapToRichText(native));
    expect(native.content?.[0]?.content?.map((node) => node.type)).toEqual([
      'text',
      'image',
      'text',
      'video',
      'text',
    ]);
    expect(converted).toEqual(original);
    expect(richTextMediaReferences(converted)).toEqual(richTextMediaReferences(original));
    expect(richTextToPlainText(converted)).toBe('사진 앞  사진 뒤 동영상 앞  동영상 뒤\n\n마지막');
  });

  it('loads existing plain-text posts and a new empty draft without dropping blank paragraphs', () => {
    expect(tiptapToRichText(richTextToTiptap(null, '예전 평문\n\n두 번째 문단'))).toEqual({
      ops: [{ insert: '예전 평문\n\n두 번째 문단\n' }],
    });
    expect(richTextToTiptap(null, '')).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    });
    expect(tiptapToRichText(richTextToTiptap(null, ''))).toEqual({ ops: [{ insert: '\n' }] });
  });

  it('retains text and line boundaries from pasted soft breaks and nested lists', () => {
    const converted = tiptapToRichText({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '줄 하나' },
            { type: 'hardBreak' },
            { type: 'text', text: '줄 둘' },
          ],
        },
        {
          type: 'orderedList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: '부모 항목' }] },
                {
                  type: 'bulletList',
                  content: [
                    {
                      type: 'listItem',
                      content: [{ type: 'paragraph', content: [{ type: 'text', text: '하위 항목' }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(RichTextDocumentSchema.safeParse(converted).success).toBe(true);
    expect(richTextToPlainText(converted)).toBe('줄 하나\n줄 둘\n부모 항목\n하위 항목');
    expect(converted.ops).toEqual([
      { insert: '줄 하나\n줄 둘\n부모 항목' },
      { insert: '\n', attributes: { list: 'ordered' } },
      { insert: '하위 항목' },
      { insert: '\n', attributes: { list: 'bullet' } },
    ]);
  });

  it('keeps invalid long and external-media drafts available for form validation', () => {
    const long = tiptapToRichText({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '가'.repeat(10001) }] }],
    });
    expect(richTextToPlainText(long)).toHaveLength(10001);
    expect(RichTextDocumentSchema.safeParse(long).success).toBe(false);
    const externalMedia = tiptapToRichText({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'image', attrs: { src: 'https://example.com/a.png' } }] },
      ],
    });
    expect(RichTextDocumentSchema.safeParse(externalMedia).success).toBe(false);
    const executableLink = tiptapToRichText({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '링크', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
          ],
        },
      ],
    });
    expect(RichTextDocumentSchema.safeParse(executableLink).success).toBe(false);
  });

  it('never silently discards an unsupported editor node or mark', () => {
    expect(() => tiptapToRichText({ type: 'doc', content: [{ type: 'table' }] })).toThrow(
      'Unsupported rich text node',
    );
    expect(() =>
      tiptapToRichText({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '지원되지 않는 서식', marks: [{ type: 'code' }] }],
          },
        ],
      }),
    ).toThrow('Unsupported rich text mark');
  });
});
