import type { JSONContent } from '@tiptap/core';
import { match } from 'ts-pattern';

import type { TRichTextAttributes, TRichTextDocument } from '@game-feedback/contracts';

type TOperation = TRichTextDocument['ops'][number];
type TMark = NonNullable<JSONContent['marks']>[number];
interface ILine {
  content: JSONContent[];
  attributes?: TRichTextAttributes;
}
interface IListGroup {
  list?: 'ordered' | 'bullet';
  lines: ILine[];
}

function inlineMarks(attributes: TRichTextAttributes = {}): TMark[] {
  const marks = [
    { enabled: attributes.bold, type: 'bold' },
    { enabled: attributes.italic, type: 'italic' },
    { enabled: attributes.underline, type: 'underline' },
    { enabled: attributes.strike, type: 'strike' },
  ].flatMap(({ enabled, type }) => (enabled ? [{ type }] : []));
  if (attributes.link) return [...marks, { type: 'link', attrs: { href: attributes.link } }];
  return marks;
}

function inlineNode(op: TOperation): JSONContent {
  const marks = inlineMarks(op.attributes);
  if (typeof op.insert === 'string') return { type: 'text', text: op.insert, marks };
  if ('image' in op.insert) return { type: 'image', attrs: { src: op.insert.image }, marks };
  return { type: 'video', attrs: { src: op.insert.video }, marks };
}

function documentLines(document: TRichTextDocument): ILine[] {
  return document.ops.reduce<{ lines: ILine[]; content: JSONContent[] }>(
    (state, op) => {
      if (typeof op.insert !== 'string') return { ...state, content: [...state.content, inlineNode(op)] };
      const parts = op.insert.split('\n');
      return parts.reduce((current, text, index) => {
        const content = text
          ? [...current.content, inlineNode({ insert: text, attributes: op.attributes })]
          : current.content;
        if (index < parts.length - 1)
          return { lines: [...current.lines, { content, attributes: op.attributes }], content: [] };
        return { lines: current.lines, content };
      }, state);
    },
    { lines: [], content: [] },
  ).lines;
}

function paragraph(line: ILine): JSONContent {
  return { type: 'paragraph', content: line.content };
}

function lineBlock(line: ILine): JSONContent {
  if (line.attributes?.header) {
    return { type: 'heading', attrs: { level: line.attributes.header }, content: line.content };
  }
  if (line.attributes?.blockquote) return { type: 'blockquote', content: [paragraph(line)] };
  return paragraph(line);
}

/** Delta remains the persisted contract. Inline media preserves its exact text/newline order. */
export function richTextToTiptap(document?: TRichTextDocument | null, body = ''): JSONContent {
  const lines: ILine[] = document
    ? documentLines(document)
    : body.split('\n').map((text) => ({
        content: text ? [{ type: 'text', text }] : [],
      }));
  const groups = lines.reduce<IListGroup[]>((result, line) => {
    const list = line.attributes?.list;
    const previous = result.at(-1);
    if (list && previous?.list === list)
      return [...result.slice(0, -1), { list, lines: [...previous.lines, line] }];
    return [...result, { list, lines: [line] }];
  }, []);
  return {
    type: 'doc',
    content: groups.flatMap((group) => {
      if (!group.list) return group.lines.map(lineBlock);
      return [
        {
          type: group.list === 'ordered' ? 'orderedList' : 'bulletList',
          content: group.lines.map((line) => ({ type: 'listItem', content: [paragraph(line)] })),
        },
      ];
    }),
  };
}

function markAttributes(marks: TMark[] = []): TRichTextAttributes {
  return marks.reduce<TRichTextAttributes>((attributes, mark) => {
    const flag = match(mark.type)
      .with('bold', () => ({ bold: true }))
      .with('italic', () => ({ italic: true }))
      .with('underline', () => ({ underline: true }))
      .with('strike', () => ({ strike: true }))
      .with('link', () => (typeof mark.attrs?.href === 'string' ? { link: mark.attrs.href } : {}))
      .otherwise(() => {
        throw new Error(`Unsupported rich text mark: ${mark.type}`);
      });
    return { ...attributes, ...flag };
  }, {});
}

function operation(insert: TOperation['insert'], attributes: TRichTextAttributes): TOperation {
  if (Object.keys(attributes).length) return { insert, attributes };
  return { insert };
}

function mediaSource(node: JSONContent): string {
  if (typeof node.attrs?.src === 'string') return node.attrs.src;
  throw new Error('Rich text media requires a source');
}

function nodeOperations(node: JSONContent, attributes: TRichTextAttributes = {}): TOperation[] {
  const children = (blockAttributes: TRichTextAttributes) =>
    (node.content ?? []).flatMap((child) => nodeOperations(child, blockAttributes));
  return match(node.type)
    .with('doc', 'listItem', () => children(attributes))
    .with('paragraph', () => [...children(attributes), operation('\n', attributes)])
    .with('heading', () => {
      const level = node.attrs?.level === 3 ? 3 : 2;
      const heading = { ...attributes, header: level } satisfies TRichTextAttributes;
      return [...children(heading), operation('\n', heading)];
    })
    .with('blockquote', () => children({ ...attributes, blockquote: true }))
    .with('bulletList', () => children({ ...attributes, list: 'bullet' }))
    .with('orderedList', () => children({ ...attributes, list: 'ordered' }))
    .with('hardBreak', () => [operation('\n', attributes)])
    .with('text', () => (node.text ? [operation(node.text, markAttributes(node.marks))] : []))
    .with('image', () => [operation({ image: mediaSource(node) }, markAttributes(node.marks))])
    .with('video', () => [operation({ video: mediaSource(node) }, markAttributes(node.marks))])
    .otherwise(() => {
      throw new Error(`Unsupported rich text node: ${node.type}`);
    });
}

/** Validation belongs to the form so an over-limit draft remains editable. */
export function tiptapToRichText(document: JSONContent): TRichTextDocument {
  const operations = nodeOperations(document);
  const last = operations.at(-1)?.insert;
  const terminated =
    typeof last === 'string' && last.endsWith('\n') ? operations : [...operations, { insert: '\n' }];
  const ops = terminated.reduce<TOperation[]>((result, op) => {
    const previous = result.at(-1);
    if (
      typeof previous?.insert === 'string' &&
      typeof op.insert === 'string' &&
      JSON.stringify(previous.attributes) === JSON.stringify(op.attributes)
    ) {
      return [...result.slice(0, -1), { ...previous, insert: previous.insert + op.insert }];
    }
    return [...result, op];
  }, []);
  return { ops };
}
