import type supertest from 'supertest';

import { MediaUploadPlanSchema } from '@game-feedback/contracts';

export async function transferMedia(
  plan: ReturnType<typeof MediaUploadPlanSchema.parse>,
  bytes: Uint8Array,
  mimeType: string,
  name = 'file',
) {
  const body = new FormData();
  for (const [key, value] of Object.entries(plan.fields)) body.append(key, value);
  body.append('file', new Blob([Uint8Array.from(bytes)], { type: mimeType }), name);
  return fetch(plan.url, { method: 'POST', body });
}
export async function presignedUpload(
  agent: ReturnType<typeof supertest.agent>,
  path: string,
  bytes: Uint8Array,
  mimeType: string,
  name: string,
  completeStatus = 200,
) {
  const reserved = await agent
    .post(`${path}/uploads`)
    .set('Origin', 'http://localhost:3300')
    .send({ name, mimeType, size: bytes.length })
    .expect(200);
  const plan = MediaUploadPlanSchema.parse(reserved.body);
  const transferred = await transferMedia(plan, bytes, mimeType, name);
  if (transferred.status !== 204) throw new Error(`S3 upload failed: ${transferred.status}`);
  return agent
    .post(`${path}/${plan.id}/complete`)
    .set('Origin', 'http://localhost:3300')
    .expect(completeStatus);
}
