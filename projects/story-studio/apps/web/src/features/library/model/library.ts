import { z } from 'zod';

import { librarySchema, projectSchema, type TProject } from '../../story/model/story';

// Works used to live in this browser key. It is read once to move them into the studio's data folder.
export const libraryKey = 'story-studio.library.v1';
// Edits not yet saved when the page closes wait here and are sent first on the next visit.
export const outboxKey = 'story-studio.outbox.v1';
export function readLibrary(storage: Pick<Storage, 'getItem'>) {
  const raw = storage.getItem(libraryKey);
  return raw === null ? [] : librarySchema.parse(JSON.parse(raw));
}
export function readBackup(raw: string): TProject {
  return projectSchema.parse(JSON.parse(raw));
}
// `revision` is the `updatedAt` the studio's file had when this browser last read or saved the work.
export type TSynced = Map<string, { project: TProject; revision: string }>;
const pendingSchema = z.array(z.object({ project: projectSchema, base: z.string().nullable() }));
export type TPending = z.infer<typeof pendingSchema>;
// A work is unsaved when its object is not the one last read from or saved to the studio.
export function pendingSaves(projects: TProject[], synced: TSynced): TPending {
  return projects
    .filter((project) => synced.get(project.id)?.project !== project)
    .map((project) => ({ project, base: synced.get(project.id)?.revision ?? null }));
}
export function removedIds(projects: TProject[], synced: TSynced) {
  return [...synced.keys()].filter((id) => !projects.some((project) => project.id === id));
}
export function readOutbox(storage: Pick<Storage, 'getItem'>): TPending {
  const raw = storage.getItem(outboxKey);
  if (raw === null) return [];
  try {
    const parsed = pendingSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch (error) {
    // An outbox this version cannot read holds nothing it can send.
    if (error instanceof SyntaxError) return [];
    throw error;
  }
}
export function downloadFile(value: string | Blob, name: string, mime = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(value instanceof Blob ? value : new Blob([value], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
