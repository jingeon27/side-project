import { z } from 'zod';

import { projectSchema, type TProject } from '../../story/model/story';

const librarySchema = z.object({ projects: z.array(projectSchema), unreadable: z.number().int().min(0) });
async function answer(response: Response) {
  const data: unknown = await response.json();
  if (response.ok) return data;
  const error = z.object({ error: z.string() }).safeParse(data);
  throw new Error(error.success ? error.data.error : '작품 요청을 처리하지 못했습니다.');
}
export async function fetchLibrary(signal?: AbortSignal) {
  return librarySchema.parse(await answer(await fetch('/api/projects', { signal, cache: 'no-store' })));
}
export async function fetchProject(id: string, signal?: AbortSignal) {
  return projectSchema.parse(await answer(await fetch(`/api/projects/${id}`, { signal, cache: 'no-store' })));
}
// Saving states the version this browser started from. When the studio holds another version, the
// stored work comes back as `conflict` and nothing is overwritten.
export async function saveProject(
  project: TProject,
  base: string | null,
): Promise<{ saved: TProject } | { conflict: TProject }> {
  const response = await fetch(`/api/projects/${project.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, base }),
  });
  if (response.status === 409) {
    const stored = z.object({ project: projectSchema }).safeParse(await response.json());
    if (stored.success) return { conflict: stored.data.project };
    throw new Error('작품을 저장하지 못했습니다.');
  }
  return { saved: projectSchema.parse(await answer(response)) };
}
export async function removeProject(id: string) {
  await answer(await fetch(`/api/projects/${id}`, { method: 'DELETE', keepalive: true }));
}
