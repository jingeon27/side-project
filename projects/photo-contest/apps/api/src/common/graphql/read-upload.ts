import type { FileUpload } from 'graphql-upload/processRequest.mjs';

import { fail } from '../errors';

export async function readUpload(file: Promise<FileUpload>, maxBytes: number) {
  try {
    const upload = await file;
    const stream = upload.createReadStream();
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes) {
        stream.destroy();
        fail('파일 크기 제한을 초과했습니다.');
      }
      chunks.push(buffer);
    }
    return { body: Buffer.concat(chunks), contentType: upload.mimetype };
  } catch {
    fail('파일을 읽을 수 없습니다. 파일 형식과 크기를 확인해 주세요.');
  }
}
