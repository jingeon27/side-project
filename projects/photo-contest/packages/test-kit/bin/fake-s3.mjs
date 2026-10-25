#!/usr/bin/env node
// 개발 서버와 운영 컨테이너 검증에서 S3 대역만 띄운다. tsx 없이 Node의 타입 제거로 원본을 읽는다.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
const envFile = `${projectRoot}.env`;
if (existsSync(envFile)) process.loadEnvFile(envFile);

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name}이 필요합니다. projects/photo-contest/.env.example을 확인하세요.`);
  return value;
};
const endpointPort = () => {
  try {
    return Number(new URL(process.env.S3_ENDPOINT ?? '').port) || undefined;
  } catch {
    return undefined;
  }
};

const { startFakeS3 } = await import('../src/fake-s3.ts');
const s3 = await startFakeS3({
  directory: `${projectRoot}.data/s3`,
  bucket: required('S3_BUCKET'),
  region: process.env.S3_REGION || 'us-east-1',
  accessKeyId: required('AWS_ACCESS_KEY_ID'),
  secretAccessKey: required('AWS_SECRET_ACCESS_KEY'),
  corsOrigins: (process.env.WEB_ORIGIN ?? 'http://localhost:3200')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  port: endpointPort() || 4210,
  host: ['localhost', '127.0.0.1'].includes(URL.parse(process.env.S3_ENDPOINT ?? '')?.hostname ?? 'localhost')
    ? '127.0.0.1'
    : '0.0.0.0',
});
console.log(`S3 대역 ${s3.bucket} ready on ${s3.endpoint}. Stop with Ctrl+C.`);
const stop = () => s3.stop().then(() => process.exit(0));
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
