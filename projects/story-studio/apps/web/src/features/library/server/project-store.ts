import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';

import { z } from 'zod';

import { StudioError } from '../../../shared/server/errors';
import { dataPath } from '../../media/server/assets';
import { libraryLimit, projectSchema, type TProject } from '../../story/model/story';

// Works live in the data folder, one file each. The browser edits a copy and saves it back; a writing
// job on the server appends scenes to the same file, so every save states which version it started from.
export class ProjectConflictError extends StudioError {
  constructor(readonly current: TProject) {
    super('이 작품이 다른 곳에서 바뀌었습니다. 최신 내용을 다시 불러왔습니다.', 409);
  }
}
const runtime = globalThis as typeof globalThis & { storyStudioProjectLocks?: Map<string, Promise<void>> };
const locks = runtime.storyStudioProjectLocks ?? new Map<string, Promise<void>>();
runtime.storyStudioProjectLocks = locks;
function projectPath(id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new StudioError('올바른 작품이 아닙니다.', 400);
  return dataPath('projects', `${id}.json`);
}
// Saves and server-side edits of one work run one at a time in this process.
async function withProject<T>(id: string, action: () => Promise<T>): Promise<T> {
  const previous = locks.get(id) ?? Promise.resolve();
  const next = Promise.withResolvers<void>();
  locks.set(id, next.promise);
  await previous;
  try {
    return await action();
  } finally {
    next.resolve();
    if (locks.get(id) === next.promise) locks.delete(id);
  }
}
async function projectFiles() {
  try {
    return (await readdir(dataPath('projects'))).filter((name) => name.endsWith('.json'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}
async function stored(id: string) {
  try {
    return projectSchema.parse(JSON.parse(await readFile(projectPath(id), 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
async function write(project: TProject) {
  await mkdir(dataPath('projects'), { recursive: true });
  const partial = `${projectPath(project.id)}.${randomUUID()}.partial`;
  await writeFile(partial, JSON.stringify(projectSchema.parse(project)), { flag: 'wx', mode: 0o600 });
  await rename(partial, projectPath(project.id));
  return project;
}

export async function listProjects() {
  const results = await Promise.all(
    (await projectFiles()).map(async (name) => {
      const raw = await readFile(dataPath('projects', name), 'utf8');
      try {
        return projectSchema.safeParse(JSON.parse(raw));
      } catch (error) {
        if (error instanceof SyntaxError) return { success: false as const };
        throw error;
      }
    }),
  );
  const projects = results.flatMap((result) => (result.success ? [result.data] : []));
  return {
    projects: projects.sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)),
    // A file this version cannot read stays on disk and is reported instead of being dropped silently.
    unreadable: results.length - projects.length,
  };
}
export async function readProject(id: string) {
  const project = await stored(id);
  if (!project) throw new StudioError('작품을 찾을 수 없습니다.', 404);
  return project;
}
// `base` is the `updatedAt` the caller last saw, or null for a work it believes is new.
export async function saveProject(project: TProject, base: string | null) {
  return withProject(project.id, async () => {
    const current = await stored(project.id);
    if (current && current.updatedAt !== base) throw new ProjectConflictError(current);
    if (!current && (await projectFiles()).length >= libraryLimit)
      throw new StudioError(
        `작품은 최대 ${libraryLimit}개까지 저장합니다. 기존 작품을 백업한 뒤 삭제해 주세요.`,
        409,
      );
    return write(project);
  });
}
export async function updateProject(id: string, change: (project: TProject) => TProject) {
  return withProject(id, async () => write(change(await readProject(id))));
}
export async function deleteProject(id: string) {
  return withProject(id, async () => {
    await rm(projectPath(id), { force: true });
    return { id };
  });
}
