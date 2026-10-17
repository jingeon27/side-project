import { z } from 'zod';

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
          .object({ insert: z.string().min(1).max(10001), attributes: RichTextAttributesSchema.optional() })
          .strict(),
      )
      .min(1)
      .max(2000),
  })
  .strict()
  .refine((document) => document.ops.reduce((size, op) => size + op.insert.length, 0) <= 10001)
  .refine((document) => document.ops.at(-1)?.insert.endsWith('\n') === true);
export type TRichTextDocument = z.infer<typeof RichTextDocumentSchema>;
export type TRichTextAttributes = z.infer<typeof RichTextAttributesSchema>;
export function richTextToPlainText(document: TRichTextDocument) {
  return document.ops
    .map((op) => op.insert)
    .join('')
    .trim();
}
