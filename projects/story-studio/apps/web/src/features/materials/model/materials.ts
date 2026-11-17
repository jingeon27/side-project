import { z } from 'zod';

// Reference materials are documents the writer may consult. The catalog of documents is the source of
// truth; the local engine keeps a vector index in step with it and reads from the index while writing.
export const materialLimits = {
  characters: 300_000,
  alwaysCharacters: 6_000,
  documents: 20,
  requestCharacters: 1_500_000,
  total: 20_000,
  listed: 200,
} as const;
export const collectionNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[\p{L}\p{N} _-]+$/u);
// How a document reaches the writer: every request, only its passages related to the scene, or as prose to imitate.
export const materialRoles = [
  { id: 'search', name: '관련 부분 검색', description: '쓰는 장면과 관련된 부분만 찾아 넣어요' },
  { id: 'always', name: '항상 포함', description: '인물 설정처럼 매번 필요한 6천 자 이하의 자료예요' },
  { id: 'style', name: '문체 참고', description: '내용과 관계없이 문장 견본을 뽑아 넣어요' },
] as const;
const materialRoleSchema = z.enum(['search', 'always', 'style']);
export type TMaterialRole = z.infer<typeof materialRoleSchema>;
const titleSchema = z.string().trim().min(1).max(120);
export const materialUploadSchema = z
  .object({
    collection: collectionNameSchema,
    role: materialRoleSchema.default('search'),
    documents: z
      .array(z.object({ title: titleSchema, text: z.string().min(1).max(materialLimits.characters) }))
      .min(1)
      .max(materialLimits.documents),
  })
  .refine(
    (upload) =>
      upload.documents.reduce((sum, document) => sum + document.text.length, 0) <=
      materialLimits.requestCharacters,
  )
  // A document sent with every request has to stay short enough to leave room for the story.
  .refine(
    (upload) =>
      upload.role !== 'always' ||
      upload.documents.every((document) => document.text.length <= materialLimits.alwaysCharacters),
  );
export type TMaterialUpload = z.infer<typeof materialUploadSchema>;
export const materialEntrySchema = z.object({
  id: z.string().uuid(),
  title: titleSchema,
  collection: collectionNameSchema,
  role: materialRoleSchema,
  characters: z.number().int().positive(),
  // Lets the engine notice a changed text without reading it.
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(),
});
export type TMaterialEntry = z.infer<typeof materialEntrySchema>;
// `passages` is absent until the engine has indexed the document.
export const materialSchema = materialEntrySchema.extend({ passages: z.number().int().min(0).optional() });
export type TMaterial = z.infer<typeof materialSchema>;
export const materialOverviewSchema = z.object({
  ready: z.boolean(),
  inbox: z.string(),
  sync: z.object({
    running: z.boolean(),
    progress: z.string().optional(),
    error: z.string().optional(),
  }),
  collections: z.array(
    z.object({
      name: collectionNameSchema,
      documents: z.number().int().min(0),
      pending: z.number().int().min(0),
    }),
  ),
});
export const materialListSchema = z.object({
  materials: z.array(materialSchema),
  total: z.number().int().min(0),
});
export const materialActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('upload'), upload: materialUploadSchema }),
  z.object({ action: z.literal('import') }),
  z.object({ action: z.literal('sync') }),
  z.object({ action: z.literal('stop') }),
  z.object({ action: z.literal('delete-collection'), collection: collectionNameSchema }),
]);
export const materialChangeSchema = z.object({
  added: z.number().int().min(0),
  skipped: z.number().int().min(0),
});

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
// Group documents so each upload stays within the request limits.
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
