import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import dayjs from 'dayjs';
import { z } from 'zod';

import { StudioError } from '../../../shared/server/errors';
import { localConfiguration, runLocal } from '../../../shared/server/local-worker';
import { dataPath } from '../../media/server/assets';
import {
  collectionNameSchema,
  materialEntrySchema,
  materialKey,
  materialLimits,
  splitMaterial,
  type TMaterial,
  type TMaterialEntry,
  type TMaterialUpload,
} from '../model/materials';

// The catalog and the texts are the source of truth for which documents exist. The engine's index is
// derived from them: a sync indexes what the catalog has and the index lacks, and removes the rest.
type TSync = { controller: AbortController; progress: string };
type TState = { lock: Promise<void>; sync?: TSync; error?: string; again: boolean };
const runtime = globalThis as typeof globalThis & { storyStudioMaterials?: TState };
const state: TState = runtime.storyStudioMaterials ?? { lock: Promise.resolve(), again: false };
runtime.storyStudioMaterials = state;

const catalogSchema = z.object({ documents: z.array(materialEntrySchema) });
// Written by the engine after it indexes a document; read here only to report progress.
const indexStateSchema = z.object({
  documents: z.record(z.string(), z.object({ passages: z.number().int().min(0) })),
});
function textPath(id: string) {
  return dataPath('materials', 'files', `${id}.txt`);
}
function inboxPath(...parts: string[]) {
  return dataPath('materials', 'inbox', ...parts);
}
async function readJsonFile(file: string) {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
async function readCatalog() {
  const stored = await readJsonFile(dataPath('materials', 'catalog.json'));
  return stored === undefined ? [] : catalogSchema.parse(stored).documents;
}
async function readIndexed() {
  const stored = await readJsonFile(dataPath('materials', 'index-state.json'));
  return stored === undefined ? {} : indexStateSchema.parse(stored).documents;
}
async function writeCatalog(documents: TMaterialEntry[]) {
  await mkdir(dataPath('materials'), { recursive: true });
  const partial = dataPath('materials', `catalog.json.${randomUUID()}.partial`);
  await writeFile(partial, JSON.stringify({ documents }), { flag: 'wx', mode: 0o600 });
  await rename(partial, dataPath('materials', 'catalog.json'));
}
// Catalog edits in this process run one at a time, so two uploads never overwrite each other's entries.
async function withCatalog<T>(action: (documents: TMaterialEntry[]) => Promise<T>): Promise<T> {
  const previous = state.lock;
  const next = Promise.withResolvers<void>();
  state.lock = next.promise;
  await previous;
  try {
    return await action(await readCatalog());
  } finally {
    next.resolve();
  }
}

export async function materialOverview() {
  const [documents, indexed] = await Promise.all([readCatalog(), readIndexed()]);
  const names = [...new Set(documents.map((document) => document.collection))].sort((first, second) =>
    first.localeCompare(second, 'ko'),
  );
  return {
    ready: localConfiguration().materialReady,
    inbox: inboxPath(),
    sync: { running: Boolean(state.sync), progress: state.sync?.progress, error: state.error },
    collections: names.map((name) => {
      const items = documents.filter((document) => document.collection === name);
      return {
        name,
        documents: items.length,
        pending: items.filter((document) => !(document.id in indexed)).length,
      };
    }),
  };
}
export async function listCollection(collection: string) {
  const [documents, indexed] = await Promise.all([readCatalog(), readIndexed()]);
  const items = documents
    .filter((document) => document.collection === collection)
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  return {
    total: items.length,
    materials: items
      .slice(0, materialLimits.listed)
      .map((document): TMaterial => ({ ...document, passages: indexed[document.id]?.passages })),
  };
}

async function register(uploads: TMaterialUpload[]) {
  const result = await withCatalog(async (documents) => {
    const known = new Set(documents.map(materialKey));
    const createdAt = dayjs().toISOString();
    // The same title and length in the same collection is the same document: adding it again is skipped.
    const fresh = uploads.flatMap((upload) =>
      upload.documents.flatMap((document) => {
        const entry = {
          collection: upload.collection,
          title: document.title,
          characters: document.text.length,
        };
        if (known.has(materialKey(entry))) return [];
        known.add(materialKey(entry));
        return [
          {
            text: document.text,
            entry: materialEntrySchema.parse({
              ...entry,
              id: randomUUID(),
              role: upload.role,
              digest: createHash('sha256').update(document.text).digest('hex'),
              createdAt,
            }),
          },
        ];
      }),
    );
    if (documents.length + fresh.length > materialLimits.total)
      throw new StudioError(
        `참고 자료는 최대 ${materialLimits.total.toLocaleString('ko-KR')}개까지 저장합니다.`,
        409,
      );
    await mkdir(dataPath('materials', 'files'), { recursive: true });
    // Texts are written before the catalog lists them, so a listed document always has its text.
    await Promise.all(fresh.map((item) => writeFile(textPath(item.entry.id), item.text, { mode: 0o600 })));
    if (fresh.length) await writeCatalog([...documents, ...fresh.map((item) => item.entry)]);
    const total = uploads.reduce((sum, upload) => sum + upload.documents.length, 0);
    return { added: fresh.length, skipped: total - fresh.length };
  });
  if (result.added) startSync();
  return result;
}
export async function addMaterials(upload: TMaterialUpload) {
  return register([upload]);
}
// Files dropped into `materials/inbox/<collection>/` are registered without passing through the browser.
// They stay where they are; importing again skips what is already registered.
export async function importInbox() {
  const folders = await readdir(inboxPath(), { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    },
  );
  const uploads = await Promise.all(
    folders
      .filter((folder) => folder.isDirectory() && collectionNameSchema.safeParse(folder.name).success)
      .map(async (folder) => {
        const files = (await readdir(inboxPath(folder.name), { withFileTypes: true })).filter(
          (file) => file.isFile() && /\.(txt|md)$/i.test(file.name),
        );
        const documents = await Promise.all(
          files.map(async (file) =>
            splitMaterial(
              path.parse(file.name).name.normalize('NFC'),
              await readFile(inboxPath(folder.name, file.name), 'utf8'),
            ),
          ),
        );
        return {
          collection: folder.name.normalize('NFC'),
          role: 'search' as const,
          documents: documents.flat(),
        };
      }),
  );
  return register(uploads.filter((upload) => upload.documents.length > 0));
}

async function remove(select: (document: TMaterialEntry) => boolean) {
  const ids = (await readCatalog()).filter(select).map((document) => document.id);
  if (!ids.length) throw new StudioError('참고 자료를 찾을 수 없습니다.', 404);
  // Passages leave the index first: a document must not be retrievable once the catalog stops listing it.
  await runLocal({ action: 'delete-material', ids });
  await withCatalog((documents) => writeCatalog(documents.filter((document) => !ids.includes(document.id))));
  await Promise.all(ids.map((id) => rm(textPath(id), { force: true })));
  return { deleted: ids.length };
}
export async function deleteMaterial(id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new StudioError('올바른 참고 자료가 아닙니다.', 400);
  return remove((document) => document.id === id);
}
export async function deleteCollection(collection: string) {
  return remove((document) => document.collection === collection);
}

// One sync runs at a time. Documents added while it runs are picked up by one more run after it.
export function startSync() {
  if (state.sync) {
    state.again = true;
    return;
  }
  if (!localConfiguration().materialReady) {
    state.error = '참고 자료 검색 모델이 아직 없습니다. 연결 안내의 로컬 설치 명령을 다시 실행해 주세요.';
    return;
  }
  const sync = { controller: new AbortController(), progress: '색인을 준비하는 중' };
  state.sync = sync;
  state.error = undefined;
  state.again = false;
  void (async () => {
    try {
      await runLocal({ action: 'sync-material' }, sync.controller.signal, (message) => {
        sync.progress = message;
      });
    } catch (error) {
      // Indexed documents are kept; the rest stay pending until the next sync.
      state.error = sync.controller.signal.aborted
        ? '색인을 중단했습니다. 다시 시작하면 남은 자료부터 이어서 색인합니다.'
        : error instanceof StudioError
          ? error.message
          : '참고 자료 색인에 실패했습니다. 로컬 로그를 확인한 뒤 다시 시도해 주세요.';
    } finally {
      state.sync = undefined;
      if (state.again && !state.error) startSync();
    }
  })();
}
export function stopSync() {
  state.again = false;
  state.sync?.controller.abort();
}
