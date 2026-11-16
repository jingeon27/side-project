import { readFile } from 'node:fs/promises';

import { z } from 'zod';

const parseJson = (path: string, text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path}가 JSON이 아닙니다.`, { cause: error });
  }
};

// 재개·제어 파일은 이전 버전이 썼거나 손으로 고쳤을 수 있다. 형식이 다르면 경로와 이유를 밝히고 멈춘다.
export async function readJsonFile<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
): Promise<z.output<Schema>> {
  const parsed = schema.safeParse(parseJson(path, await readFile(path, 'utf8')));
  if (!parsed.success) throw new Error(`${path} 형식이 맞지 않습니다.\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

export async function readOptionalJsonFile<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
): Promise<z.output<Schema> | null> {
  try {
    return await readJsonFile(path, schema);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
