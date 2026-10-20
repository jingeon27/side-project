import { isAbsolute } from 'node:path';
import { z } from 'zod';

const filesystemSchema = z.object({
  driver: z.literal('FILESYSTEM'),
  directory: z.string().refine(isAbsolute),
});
const s3Schema = z.object({
  driver: z.literal('S3'),
  bucket: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
  region: z.string().min(1),
  endpoint: z.url().optional(),
  forcePathStyle: z.boolean().optional(),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(8),
});
const storageSchema = z.discriminatedUnion('driver', [
  z.object({ driver: z.literal('DATABASE') }),
  filesystemSchema,
  s3Schema,
]);
export type TMediaStorageConfig = z.infer<typeof storageSchema>;

export function resolveMediaStorageConfig(env: NodeJS.ProcessEnv): TMediaStorageConfig {
  const driver = env.GF_MEDIA_STORAGE ?? (env.NODE_ENV === 'production' ? 'FILESYSTEM' : 'DATABASE');
  const result = storageSchema.safeParse({
    driver,
    directory: env.GF_MEDIA_DIRECTORY ?? '/var/lib/game-feedback/media',
    bucket: env.GF_S3_BUCKET,
    region: env.GF_S3_REGION ?? 'auto',
    endpoint: env.GF_S3_ENDPOINT || undefined,
    forcePathStyle: env.GF_S3_FORCE_PATH_STYLE === 'true',
    accessKeyId: env.GF_S3_ACCESS_KEY_ID,
    secretAccessKey: env.GF_S3_SECRET_ACCESS_KEY,
  });
  if (!result.success) throw new Error('Invalid media storage configuration.');
  if (env.NODE_ENV === 'production') {
    if (driver === 'DATABASE') throw new Error('Production uploads require FILESYSTEM or S3 storage.');
    if (result.data.driver === 'S3' && result.data.endpoint && !result.data.endpoint.startsWith('https://'))
      throw new Error('Production S3 endpoint must use HTTPS.');
  }
  return result.data;
}
