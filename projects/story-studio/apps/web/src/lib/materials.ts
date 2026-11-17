import { z } from 'zod';

// Reference materials are documents the writer may consult. The local engine indexes their passages
// in a vector database and retrieves the closest ones while planning and writing.
export const materialLimits = { characters: 300_000, documents: 20, requestCharacters: 1_500_000 } as const;
export const collectionNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[\p{L}\p{N} _-]+$/u);
const titleSchema = z.string().trim().min(1).max(120);
export const materialUploadSchema = z
  .object({
    collection: collectionNameSchema,
    documents: z
      .array(z.object({ title: titleSchema, text: z.string().min(1).max(materialLimits.characters) }))
      .min(1)
      .max(materialLimits.documents),
  })
  .refine(
    (upload) =>
      upload.documents.reduce((sum, document) => sum + document.text.length, 0) <=
      materialLimits.requestCharacters,
  );
export type TMaterialUpload = z.infer<typeof materialUploadSchema>;
export const materialSchema = z.object({
  id: z.string().uuid(),
  title: titleSchema,
  collection: collectionNameSchema,
  characters: z.number().int().positive(),
  passages: z.number().int().min(0),
  createdAt: z.string().datetime(),
});
export type TMaterial = z.infer<typeof materialSchema>;
export const materialCatalogSchema = z.object({ ready: z.boolean(), materials: z.array(materialSchema) });

type TDocument = TMaterialUpload['documents'][number];
function partition(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const paragraph = text.lastIndexOf('\n', limit);
  const end = paragraph > limit / 2 ? paragraph : limit;
  return [text.slice(0, end), ...partition(text.slice(end), limit)];
}
// A file longer than one document becomes numbered parts, cut at a paragraph where possible.
export function splitMaterial(title: string, text: string, limit: number = materialLimits.characters) {
  const parts = partition(text, limit).filter((part) => part.trim());
  const name = title.trim().slice(0, 100) || '제목 없는 자료';
  return parts.map((part, index): TDocument => ({
    title: parts.length > 1 ? `${name} (${index + 1}/${parts.length})` : name,
    text: part,
  }));
}
// Group documents so each upload stays within the request limits and loads the embedding model once.
export function batchMaterials(documents: TDocument[]) {
  return documents.reduce<TDocument[][]>((batches, document) => {
    const last = batches.at(-1);
    const size = last?.reduce((sum, item) => sum + item.text.length, 0) ?? 0;
    if (
      !last ||
      last.length >= materialLimits.documents ||
      size + document.text.length > materialLimits.requestCharacters
    )
      return [...batches, [document]];
    return [...batches.slice(0, -1), [...last, document]];
  }, []);
}
// The same file added again to the same collection is recognized and skipped, so a failed upload can be retried.
export function materialKey(material: { collection: string; title: string; characters: number }) {
  return `${material.collection}\n${material.title}\n${material.characters}`;
}
