import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';

import dayjs from 'dayjs';
import { z } from 'zod';

import { materialSchema, type TMaterial, type TMaterialUpload } from '../lib/materials';
import { dataPath } from './assets';
import { StudioError } from './errors';
import { localConfiguration, runLocal } from './local-worker';

// The web app owns each document's text and description; the engine owns the vector index built from them.
const materialLimit = 5000;
function documentPath(id: string) {
  return dataPath('materials', 'documents', `${id}.json`);
}
function textPath(id: string) {
  return dataPath('materials', 'files', `${id}.txt`);
}
async function documentNames() {
  try {
    return (await readdir(dataPath('materials', 'documents'))).filter((name) => name.endsWith('.json'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}
export async function listMaterials(): Promise<TMaterial[]> {
  const materials = await Promise.all(
    (await documentNames()).map(async (name) =>
      materialSchema.parse(JSON.parse(await readFile(dataPath('materials', 'documents', name), 'utf8'))),
    ),
  );
  return materials.sort((first, second) => second.createdAt.localeCompare(first.createdAt));
}
const indexedSchema = z.object({
  documents: z.array(z.object({ id: z.string().uuid(), passages: z.number().int().min(0) })),
});
export async function addMaterials(upload: TMaterialUpload, signal?: AbortSignal) {
  if (!localConfiguration().materialReady)
    throw new StudioError(
      '참고 자료 검색 모델이 아직 없습니다. 연결 안내의 로컬 설치 명령을 다시 실행해 주세요.',
      503,
    );
  if ((await documentNames()).length + upload.documents.length > materialLimit)
    throw new StudioError(`참고 자료는 최대 ${materialLimit}개까지 저장합니다.`, 409);
  const documents = upload.documents.map((document) => ({ ...document, id: randomUUID() }));
  await mkdir(dataPath('materials', 'files'), { recursive: true });
  await mkdir(dataPath('materials', 'documents'), { recursive: true });
  try {
    await Promise.all(
      documents.map((document) =>
        writeFile(textPath(document.id), document.text, { flag: 'wx', mode: 0o600 }),
      ),
    );
    const indexed = indexedSchema.parse(
      await runLocal(
        {
          action: 'index-material',
          documents: documents.map((document) => ({
            id: document.id,
            title: document.title,
            collection: upload.collection,
          })),
        },
        signal,
      ),
    );
    const createdAt = dayjs().toISOString();
    const materials = documents.map((document) =>
      materialSchema.parse({
        id: document.id,
        title: document.title,
        collection: upload.collection,
        characters: document.text.length,
        passages: indexed.documents.find((item) => item.id === document.id)?.passages,
        createdAt,
      }),
    );
    await Promise.all(
      materials.map(async (material) => {
        const partial = `${documentPath(material.id)}.partial`;
        await writeFile(partial, JSON.stringify(material), { flag: 'wx', mode: 0o600 });
        await rename(partial, documentPath(material.id));
      }),
    );
    return materials;
  } catch (error) {
    // A document is listed only with its description. Remove everything a failed upload left so it can be retried.
    await removeStored(documents.map((document) => document.id)).catch(() =>
      console.error('실패한 참고 자료 업로드를 정리하지 못했습니다.'),
    );
    throw error;
  }
}
async function removeStored(ids: string[]) {
  // Passages leave the index first: a document must not be retrievable once it is no longer listed.
  await runLocal({ action: 'delete-material', ids });
  await Promise.all(
    ids.flatMap((id) => [
      rm(documentPath(id), { force: true }),
      rm(`${documentPath(id)}.partial`, { force: true }),
      rm(textPath(id), { force: true }),
    ]),
  );
}
export async function deleteMaterial(id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new StudioError('올바른 참고 자료가 아닙니다.', 400);
  await readFile(documentPath(id)).catch(() => {
    throw new StudioError('참고 자료를 찾을 수 없습니다.', 404);
  });
  await removeStored([id]);
  return { id };
}
