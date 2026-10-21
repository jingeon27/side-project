import { z } from 'zod';

import { RichTextEmbedSchema } from './post-media';

export const RichTextAttributesSchema = z
  .object({
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    strike: z.boolean().optional(),
    link: z
      .string()
      .url()
      .max(2048)
      .regex(/^[Hh][Tt][Tt][Pp][Ss]?:\/\/.+$/)
      .optional(),
    header: z.union([z.literal(2), z.literal(3)]).optional(),
    list: z.enum(['ordered', 'bullet']).optional(),
    blockquote: z.boolean().optional(),
  })
  .strict();
export const RichTextDocumentSchema = z
  .object({
    ops: z
      .array(
        z
          .object({
            insert: z.union([z.string().min(1).max(10001), RichTextEmbedSchema]),
            attributes: RichTextAttributesSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(2000),
  })
  .strict()
  .refine(
    (document) =>
      document.ops.reduce((size, op) => size + (typeof op.insert === 'string' ? op.insert.length : 1), 0) <=
      10001,
  )
  .refine((document) => document.ops.filter((op) => typeof op.insert !== 'string').length <= 10)
  .refine((document) => {
    const last = document.ops.at(-1)?.insert;
    return typeof last === 'string' && last.endsWith('\n');
  });
export type TRichTextDocument = z.infer<typeof RichTextDocumentSchema>;
export type TRichTextAttributes = z.infer<typeof RichTextAttributesSchema>;
export function richTextToPlainText(document: TRichTextDocument) {
  return document.ops
    .map((op) => (typeof op.insert === 'string' ? op.insert : ''))
    .join('')
    .trim();
}

export function richTextMediaReferences(document?: TRichTextDocument | null) {
  return [
    ...new Map(
      (document?.ops ?? []).flatMap((op) => {
        if (typeof op.insert === 'string') return [];
        const url = 'image' in op.insert ? op.insert.image : op.insert.video;
        const id = url.slice(url.lastIndexOf('/') + 1);
        return [
          [
            `${id}:${'image' in op.insert ? 'IMAGE' : 'VIDEO'}`,
            { id, url, kind: 'image' in op.insert ? ('IMAGE' as const) : ('VIDEO' as const) },
          ] as const,
        ];
      }),
    ).values(),
  ];
}
