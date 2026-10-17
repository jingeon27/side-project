import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RichTextDocumentSchema, richTextToPlainText } from '@game-feedback/contracts';
import { RichTextBody } from './RichTextBody';

describe('rich text contract and safe server rendering', () => {
  it('preserves inline formatting, paragraphs and continuous numbered lists in public HTML', () => {
    const document = RichTextDocumentSchema.parse({
      ops: [
        { insert: 'Formatted title' },
        { insert: '\n', attributes: { header: 2 } },
        { insert: 'Bold text', attributes: { bold: true } },
        { insert: ' and a ' },
        { insert: 'link', attributes: { link: 'https://example.com' } },
        { insert: '\n' },
        { insert: 'First' },
        { insert: '\n', attributes: { list: 'ordered' } },
        { insert: 'Second' },
        { insert: '\n', attributes: { list: 'ordered' } },
      ],
    });
    const html = renderToStaticMarkup(
      <RichTextBody body={richTextToPlainText(document)} document={document} />,
    );
    expect(html).toContain('<h2>');
    expect(html).toContain('<strong>Bold text</strong>');
    expect(html).toContain('href="https://example.com"');
    expect(html.match(/<ol>/g)).toHaveLength(1);
    expect(html.match(/<li>/g)).toHaveLength(2);
    expect(richTextToPlainText(document)).toBe('Formatted title\nBold text and a link\nFirst\nSecond');
  });
  it('renders pasted HTML as text and rejects executable URLs and object embeds', () => {
    const document = RichTextDocumentSchema.parse({ ops: [{ insert: '<img src=x onerror=alert(1)>\n' }] });
    const html = renderToStaticMarkup(<RichTextBody body="" document={document} />);
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
    expect(
      RichTextDocumentSchema.safeParse({
        ops: [{ insert: 'Click', attributes: { link: 'javascript:alert(1)' } }, { insert: '\n' }],
      }).success,
    ).toBe(false);
    expect(
      RichTextDocumentSchema.safeParse({ ops: [{ insert: { image: 'javascript:alert(1)' } }] }).success,
    ).toBe(false);
  });
});
