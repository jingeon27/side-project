import { z } from 'zod';

const storageSchema = z
  .object({
    bucket: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
    region: z.string().min(1),
    endpoint: z.url().optional(),
    forcePathStyle: z.boolean(),
    keyPrefix: z
      .string()
      .max(128)
      .regex(/^(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/)
      .optional(),
    accessKeyId: z.string().min(1).optional(),
    secretAccessKey: z.string().min(8).optional(),
  })
  .refine((value) => Boolean(value.accessKeyId) === Boolean(value.secretAccessKey));
export type TMediaStorageConfig = z.infer<typeof storageSchema>;

export function resolveMediaStorageConfig(env: NodeJS.ProcessEnv): TMediaStorageConfig {
  const result = storageSchema.safeParse({
    bucket: env.GF_S3_BUCKET,
    region: env.GF_S3_REGION ?? 'ap-northeast-2',
    endpoint: env.GF_S3_ENDPOINT || undefined,
    forcePathStyle: env.GF_S3_FORCE_PATH_STYLE === 'true',
    keyPrefix: (env.GF_S3_KEY_PREFIX ?? '').trim().replace(/\/$/, ''),
    accessKeyId: env.GF_S3_ACCESS_KEY_ID || undefined,
    secretAccessKey: env.GF_S3_SECRET_ACCESS_KEY || undefined,
  });
  if (!result.success) throw new Error('S3 media storage requires a bucket and valid S3 settings.');
  if (env.NODE_ENV === 'production' && result.data.endpoint && !result.data.endpoint.startsWith('https://'))
    throw new Error('Production S3 endpoint must use HTTPS.');
  return result.data;
}
