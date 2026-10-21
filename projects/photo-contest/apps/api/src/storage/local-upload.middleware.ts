import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import busboy from 'busboy';
import type { Request, Response } from 'express';

import { storageDir } from '../config/env';
import { MAX_UPLOAD_FORM_FIELD_BYTES, MAX_UPLOAD_FORM_FIELDS } from '../config/limits';
import { LocalPhotoStore } from './local-photo-store';
import { verifyLocalUploadGrant } from './local-upload-grant';

/** 서명은 URL에서 검사해 인증되지 않은 본문이 파서나 파일 스트림에 닿지 않게 한다. */
export async function localUpload(req: Request, res: Response) {
  const grant = verifyLocalUploadGrant(req.query.grant, req.query.signature);
  if (req.method !== 'POST' || !grant) {
    res.status(403).json({ message: '업로드 주소가 만료되었거나 유효하지 않습니다.' });
    return;
  }
  const directory = storageDir();
  const temporaryPath = join(directory, `.${randomUUID()}.upload`);
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const parser = busboy({
      headers: req.headers,
      limits: {
        fileSize: grant.byteSize + 1,
        files: 1,
        fields: MAX_UPLOAD_FORM_FIELDS,
        parts: MAX_UPLOAD_FORM_FIELDS + 2,
        fieldSize: MAX_UPLOAD_FORM_FIELD_BYTES,
        headerPairs: 16,
      },
    });
    const fields = new Map<string, string>();
    let invalid = false;
    let fileCount = 0;
    let fileWork: Promise<void> | undefined;
    const parsed = new Promise<void>((resolve, reject) => {
      parser.on('field', (name, value, info) => {
        if (fileCount || info.valueTruncated || fields.has(name) || !['key', 'Content-Type'].includes(name))
          invalid = true;
        fields.set(name, value);
      });
      parser.on('file', (name, stream, info) => {
        fileCount++;
        if (
          name !== 'file' ||
          fields.get('key') !== grant.key ||
          fields.get('Content-Type') !== grant.contentType ||
          info.mimeType !== grant.contentType
        )
          invalid = true;
        stream.on('limit', () => {
          invalid = true;
        });
        fileWork = pipeline(stream, createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 }));
        void fileWork.catch(reject);
      });
      for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit'] as const)
        parser.on(event, () => {
          invalid = true;
        });
      parser.once('error', reject);
      parser.once('close', resolve);
      req.once('aborted', () => parser.destroy(new Error('Upload aborted')));
      req.pipe(parser);
    });
    await parsed;
    await fileWork;
    const size = fileCount === 1 ? (await stat(temporaryPath)).size : 0;
    if (invalid || fileCount !== 1 || size !== grant.byteSize) throw new Error('Invalid upload form');
    await new LocalPhotoStore(directory).acceptUpload(grant.key, temporaryPath, grant.contentType);
    res.status(201).json({ uploaded: true });
  } catch {
    res.status(400).json({ message: '업로드한 파일의 크기와 형식을 확인해 주세요.' });
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}
