import { createHash, randomUUID } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { PrismaClient, type Prisma } from '../generated/prisma';
import type { TMediaStorageConfig } from './media-storage.config';

interface ILegacyFile {
  id: string;
  bytes: Uint8Array<ArrayBuffer> | null;
  objectId: string | null;
  mimeType: string;
  size: number;
  object: { backend: string; key: string } | null;
}
interface IOptions {
  apply?: boolean;
  directory?: string;
}
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Offline conversion only. The serving/upload path never falls back to legacy storage. */
export async function migrateLegacyMedia(
  db: PrismaClient,
  config: TMediaStorageConfig,
  options: IOptions = {},
) {
  const s3 = new S3Client({
    ...config,
    ...(config.accessKeyId && config.secretAccessKey
      ? { credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } }
      : {}),
  });
  const result = { found: 0, migrated: 0, changed: 0 };
  const where = { OR: [{ bytes: { not: null } }, { object: { backend: 'FILESYSTEM' } }] };
  const sources = [
    {
      find: (after: string) =>
        db.userAvatar.findMany({
          where: { ...where, id: { gt: after } },
          include: { object: true },
          orderBy: { id: 'asc' },
          take: 1,
        }),
      replace: (tx: Prisma.TransactionClient, file: ILegacyFile, objectId: string) =>
        tx.userAvatar.updateMany({
          where: { id: file.id, objectId: file.objectId, bytes: file.bytes },
          data: { bytes: null, objectId },
        }),
    },
    {
      find: (after: string) =>
        db.postMedia.findMany({
          where: { ...where, id: { gt: after } },
          include: { object: true },
          orderBy: { id: 'asc' },
          take: 1,
        }),
      replace: (tx: Prisma.TransactionClient, file: ILegacyFile, objectId: string) =>
        tx.postMedia.updateMany({
          where: { id: file.id, objectId: file.objectId, bytes: file.bytes },
          data: { bytes: null, objectId },
        }),
    },
    {
      find: (after: string) =>
        db.chatAttachment.findMany({
          where: { ...where, id: { gt: after } },
          include: { object: true },
          orderBy: { id: 'asc' },
          take: 1,
        }),
      replace: (tx: Prisma.TransactionClient, file: ILegacyFile, objectId: string) =>
        tx.chatAttachment.updateMany({
          where: { id: file.id, objectId: file.objectId, bytes: file.bytes },
          data: { bytes: null, objectId },
        }),
    },
  ];
  try {
    for (const source of sources) {
      let after = '';
      for (;;) {
        const [file] = await source.find(after);
        if (!file) break;
        after = file.id;
        result.found += 1;
        if (!options.apply) continue;
        if (file.size < 1 || file.size > 25 * 1024 * 1024) throw new Error('Legacy media size is invalid.');
        const bytes = await legacyBytes(file, options.directory);
        if (bytes.length !== file.size)
          throw new Error('Legacy media size does not match its database record.');
        const key = `${config.keyPrefix ? `${config.keyPrefix}/` : ''}objects/${randomUUID()}`;
        const object = await db.mediaObject.create({ data: { backend: 'S3', key } });
        await s3.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: bytes,
            ContentType: file.mimeType,
            IfNoneMatch: '*',
            ContentMD5: createHash('md5').update(bytes).digest('base64'),
          }),
        );
        const head = await s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
        if (head.ContentLength !== file.size || head.ContentType !== file.mimeType || !head.ETag)
          throw new Error('S3 verification failed.');
        const uploaded = await s3.send(
          new GetObjectCommand({ Bucket: config.bucket, Key: key, IfMatch: head.ETag }),
        );
        const verified = await uploaded.Body?.transformToByteArray();
        if (!verified || digest(verified) !== digest(bytes))
          throw new Error('S3 checksum verification failed.');
        const updated = await db.$transaction((tx) => source.replace(tx, file, object.id));
        result.migrated += updated.count;
        result.changed += updated.count ? 0 : 1;
      }
    }
    return result;
  } finally {
    s3.destroy();
  }
}
async function legacyBytes(file: ILegacyFile, directory?: string): Promise<Uint8Array> {
  if (file.bytes) return file.bytes;
  if (
    !directory ||
    file.object?.backend !== 'FILESYSTEM' ||
    !/^objects\/[a-f0-9-]{36}$/.test(file.object.key)
  )
    throw new Error('Legacy filesystem media requires an explicit source directory.');
  const root = await realpath(directory);
  const path = await realpath(resolve(root, file.object.key));
  if (!path.startsWith(root + sep)) throw new Error('Legacy media path is outside its source directory.');
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size !== file.size)
    throw new Error('Legacy file size does not match its database record.');
  return readFile(path);
}
