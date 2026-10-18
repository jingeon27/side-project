import { createReadStream } from 'node:fs';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
const name = process.argv[2];
if (!/^\d{8}T\d{6}Z-[a-f0-9]{8}-[a-f0-9]{40}$/.test(name ?? '')) throw new Error('Invalid backup name.');
const bucket = process.env.GF_BACKUP_BUCKET;
if (!bucket) {
  console.log('Offsite backup is not configured; keep an external copy of the completed local backup.');
  process.exit(0);
}
const endpoint = process.env.GF_BACKUP_ENDPOINT || undefined;
if (endpoint && !endpoint.startsWith('https://')) throw new Error('Backup endpoint must use HTTPS.');
if (!process.env.GF_BACKUP_ACCESS_KEY_ID || !process.env.GF_BACKUP_SECRET_ACCESS_KEY)
  throw new Error('Offsite backup credentials are required.');
const client = new S3Client({
  region: process.env.GF_BACKUP_REGION ?? 'ap-northeast-2',
  endpoint,
  credentials: {
    accessKeyId: process.env.GF_BACKUP_ACCESS_KEY_ID,
    secretAccessKey: process.env.GF_BACKUP_SECRET_ACCESS_KEY,
  },
});
try {
  await Promise.all(
    ['database.dump', 'media.tar.gz'].map(async (file) => {
      const upload = new Upload({
        client,
        params: {
          Bucket: bucket,
          Key: `game-feedback-backups/${name}/${file}`,
          Body: createReadStream(`/backups/${name}/${file}`),
        },
        queueSize: 2,
        partSize: 8 * 1024 * 1024,
        leavePartsOnError: false,
      });
      await upload.done();
    }),
  );
  console.log('Offsite backup uploaded.');
} catch {
  throw new Error('Offsite backup failed. The completed local backup is retained.');
} finally {
  client.destroy();
}
