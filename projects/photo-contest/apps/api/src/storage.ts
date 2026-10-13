import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
function directory() {
  return resolve(__dirname, '../../..', process.env.STORAGE_DIR ?? '.data/photos');
}
function objectStore() {
  if (process.env.STORAGE_BACKEND !== 's3') return null;
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET is required for S3 storage.');
  const client = new S3Client({
    region: process.env.S3_REGION ?? 'auto',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  });
  return { client, bucket };
}
function validKey(key: string) {
  if (!/^[a-f0-9-]{36}\.webp$/.test(key)) throw new Error('Invalid photo key');
  return key;
}
export async function putPhoto(key: string, body: Buffer) {
  validKey(key);
  const store = objectStore();
  if (store) {
    await store.client.send(
      new PutObjectCommand({ Bucket: store.bucket, Key: key, Body: body, ContentType: 'image/webp' }),
    );
    return;
  }
  await mkdir(directory(), { recursive: true, mode: 0o700 });
  await writeFile(resolve(directory(), key), body, { mode: 0o600, flag: 'wx' });
}
export async function getPhoto(key: string) {
  validKey(key);
  const store = objectStore();
  if (store) {
    const result = await store.client.send(new GetObjectCommand({ Bucket: store.bucket, Key: key }));
    if (!result.Body) throw new Error('Photo not found');
    return Buffer.from(await result.Body.transformToByteArray());
  }
  return readFile(resolve(directory(), key));
}
export async function deletePhoto(key: string) {
  validKey(key);
  const store = objectStore();
  if (store) {
    await store.client.send(new DeleteObjectCommand({ Bucket: store.bucket, Key: key }));
    return;
  }
  try {
    await unlink(resolve(directory(), key));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
