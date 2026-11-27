import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { load } from 'sqlite-vec';
import { z } from 'zod';

import type { TReadingInput } from '../contracts';
import { readingReferences } from './corpus';
import {
  experienceQueryKey,
  readingEmbeddingModel,
  readingKnowledgeFingerprint,
  readingQueries,
  readingQueryKey,
} from './embeddings';
import snapshot from './snapshot.json';

const vectors: Record<string, string> = snapshot.vectors;
const referenceRow = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  source: z.enum(['classical', 'editorial']),
});

function vectorFor(key: string) {
  const embedding = Buffer.from(vectors[key] ?? '', 'base64');
  if (embedding.byteLength !== readingEmbeddingModel.dimensions) {
    throw new Error('Invalid reading embedding for ' + key);
  }
  return embedding;
}

function loadSnapshot(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reading_meta (fingerprint TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reading_references (
      id TEXT PRIMARY KEY, scope TEXT NOT NULL, title TEXT NOT NULL,
      text TEXT NOT NULL, source TEXT NOT NULL, vector BLOB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reading_queries (
      key TEXT PRIMARY KEY, vector BLOB NOT NULL
    );
  `);
  const current = db.prepare('SELECT fingerprint FROM reading_meta').get();
  if (current?.fingerprint === snapshot.fingerprint) return;

  db.exec('DELETE FROM reading_references; DELETE FROM reading_queries; DELETE FROM reading_meta;');
  const insertReference = db.prepare(
    'INSERT INTO reading_references (id, scope, title, text, source, vector) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const insertQuery = db.prepare('INSERT INTO reading_queries (key, vector) VALUES (?, ?)');
  for (const reference of readingReferences) {
    insertReference.run(
      reference.id,
      reference.scope,
      reference.title,
      reference.text,
      reference.source,
      vectorFor(reference.id),
    );
  }
  for (const query of readingQueries) {
    insertQuery.run(query.key, vectorFor(query.key));
  }
  db.prepare('INSERT INTO reading_meta (fingerprint) VALUES (?)').run(snapshot.fingerprint);
}

function queryVector(db: DatabaseSync, key: string) {
  const vector = db.prepare('SELECT vector FROM reading_queries WHERE key = ?').get(key)?.vector;
  if (!(vector instanceof Uint8Array)) throw new Error('Missing reading query vector');
  return vector;
}

export function findReadingReferences(input: TReadingInput) {
  if (snapshot.fingerprint !== readingKnowledgeFingerprint) {
    throw new Error('Rebuild the reading snapshot with reading:embed');
  }
  const configured = process.env.DEOKDAM_READING_DB?.trim();
  const file = configured || path.resolve(process.cwd(), '.data/reading-knowledge.sqlite');
  const orders = process.env.DEOKDAM_ORDER_DB?.trim();
  if (!path.isAbsolute(file) || (orders && path.normalize(file) === path.normalize(orders))) {
    throw new Error('Reading knowledge requires its own absolute database path');
  }
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file, { allowExtension: true, timeout: 1200 });
  try {
    load(db);
    db.enableLoadExtension(false);
    db.exec('BEGIN IMMEDIATE');
    loadSnapshot(db);
    const vector = queryVector(db, readingQueryKey(input));
    const experience = input.experience ? queryVector(db, experienceQueryKey(input.experience)) : vector;

    const closest = db.prepare(`
      SELECT id, title, text, source
      FROM reading_references
      WHERE scope = ?
      ORDER BY vec_distance_cosine(vec_int8(vector), vec_int8(?))
        + 0.35 * vec_distance_cosine(vec_int8(vector), vec_int8(?)), id
      LIMIT 1
    `);
    const references = [input.element, input.concern].map((scope) =>
      referenceRow.parse(closest.get(scope, vector, experience)),
    );
    db.exec('COMMIT');
    return references;
  } finally {
    db.close();
  }
}
