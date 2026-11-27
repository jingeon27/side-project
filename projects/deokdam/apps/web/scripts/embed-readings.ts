import { spawnSync } from 'node:child_process';
import { renameSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  readingEmbeddingInputs,
  readingEmbeddingModel,
  readingKnowledgeFingerprint,
} from '../src/features/reading/knowledge/embeddings.ts';

const runner = fileURLToPath(new URL('embed-readings.py', import.meta.url));
const output = fileURLToPath(new URL('../src/features/reading/knowledge/snapshot.json', import.meta.url));
const result = spawnSync(process.env.PYTHON || 'python3', [runner], {
  encoding: 'utf8',
  input: JSON.stringify({ model: readingEmbeddingModel, inputs: readingEmbeddingInputs }),
  stdio: ['pipe', 'pipe', 'inherit'],
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error('Could not generate Deokdam reading embeddings');

const vectors: Record<string, string> = JSON.parse(result.stdout);
for (const { key } of readingEmbeddingInputs) {
  const vector = vectors[key];
  if (!vector || Buffer.from(vector, 'base64').byteLength !== readingEmbeddingModel.dimensions) {
    throw new Error('Missing or invalid embedding for ' + key);
  }
}
const staged = output + '.' + process.pid + '.tmp';
try {
  writeFileSync(
    staged,
    JSON.stringify({ fingerprint: readingKnowledgeFingerprint, vectors }, null, 2) + '\n',
  );
  renameSync(staged, output);
} finally {
  rmSync(staged, { force: true });
}
console.log('Embedded ' + readingEmbeddingInputs.length + ' Deokdam reference and query entries');
