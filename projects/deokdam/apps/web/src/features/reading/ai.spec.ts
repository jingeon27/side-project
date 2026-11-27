import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createReading } from './ai';
import { readingInputSchema } from './contracts';
import { findReadingReferences } from './knowledge/store';

function answer(referenceId: string) {
  return Response.json({ choices: [{ message: { content: JSON.stringify({ referenceId }) } }] });
}

describe('reading provider', () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'deokdam-knowledge-'));
    vi.stubEnv('DEOKDAM_READING_DB', join(directory, 'knowledge.sqlite'));
    vi.stubEnv('DEOKDAM_AI_CONTAINER', '');
    vi.stubEnv('DEOKDAM_AI_LOCAL_PORT', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    rmSync(directory, { recursive: true, force: true });
  });

  it('ignores a legacy cloud API key and returns a basic reading when the local model is unconfigured', async () => {
    vi.stubEnv('DEOKDAM_AI_API_KEY', 'test');
    vi.stubEnv('DEOKDAM_AI_MODEL', 'test-model');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const result = await createReading({ topic: 'parent', concern: 'waiting', element: 'wood' });
    expect(result).toMatchObject({ mode: 'basic' });
    expect(result.interpretation).toContain('목(木)');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shares a daily request and sends the reading choices and concise reference advice', async () => {
    vi.stubEnv('DEOKDAM_AI_CONTAINER', '1');
    vi.stubEnv('DEOKDAM_AI_MODEL', 'test-model');
    const fetch = vi.fn().mockResolvedValue(answer('silence-next'));
    vi.stubGlobal('fetch', fetch);
    const input = { topic: 'job', concern: 'silence', element: 'metal' } as const;
    const results = await Promise.all([createReading(input), createReading(input)]);
    expect(results[0]).toMatchObject({
      mode: 'ai',
      action: '다음 지원에 이어 쓸 경험 찾기',
      sources: [{ id: 'metal' }, { id: 'silence-next' }],
    });
    expect(results[0].interpretation).toContain('누구를 도왔는지 한 줄로 적어 보세요.');
    expect(results[1]).toEqual(results[0]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe('http://deokdam-model:8080/v1/chat/completions');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' });
    const request = JSON.parse(fetch.mock.calls[0]?.[1].body);
    expect(request.max_tokens).toBe(48);
    const prompt = JSON.parse(request.messages[1].content);
    expect(Object.keys(prompt).sort()).toEqual(['classical', 'concern', 'element', 'practices', 'topic']);
    expect(prompt).toMatchObject({
      topic: '취업 준비',
      concern: '지원했는데 답장이 없어요',
      element: '금(金)',
      classical: { title: results[0].sources?.[0]?.title },
    });
    expect(prompt.practices).toHaveLength(3);
    expect(prompt.practices[0]).toMatchObject({
      id: 'silence-trim',
      advice: expect.stringContaining('최근 공고'),
    });
    expect(prompt.practices[0]).not.toHaveProperty('text');
    expect(request.response_format.json_schema.schema.properties.referenceId.enum).toEqual(
      prompt.practices.map(({ id }: { id: string }) => id),
    );
  });

  it('ranks different references for the same concern and persists a single copy of the corpus', () => {
    const input = { topic: 'job', concern: 'silence' } as const;
    const earth = findReadingReferences({ ...input, element: 'earth' });
    const wood = findReadingReferences({ ...input, element: 'wood' });
    expect(earth.classical.id).toBe('earth');
    expect(earth.practices[0]?.id).toBe('silence-rhythm');
    expect(wood.classical.id).toBe('wood');
    expect(wood.practices[0]?.id).toBe('silence-next');
    const database = new DatabaseSync(join(directory, 'knowledge.sqlite'), { readOnly: true });
    try {
      expect(database.prepare('SELECT count(*) AS count FROM reading_references').get()?.count).toBe(26);
      expect(database.prepare('SELECT count(*) AS count FROM reading_queries').get()?.count).toBe(42);
    } finally {
      database.close();
    }
  });

  it('passes a fixed experience theme to the model and rejects freeform experience input', async () => {
    vi.stubEnv('DEOKDAM_AI_LOCAL_PORT', '3462');
    vi.stubEnv('DEOKDAM_AI_MODEL', 'test-experience');
    const fetch = vi.fn().mockResolvedValue(answer('interview-voice'));
    vi.stubGlobal('fetch', fetch);
    const input = { topic: 'job', concern: 'interview', element: 'fire', experience: 'interview' } as const;
    await expect(createReading(input)).resolves.toMatchObject({ mode: 'ai' });
    expect(fetch.mock.calls[0]?.[0]).toBe('http://127.0.0.1:3462/v1/chat/completions');
    const request = JSON.parse(fetch.mock.calls[0]?.[1].body);
    expect(JSON.parse(request.messages[1].content).experience).toBe('면접이나 발표에 관한 과거 경험');
    expect(readingInputSchema.safeParse({ ...input, pastExperience: '지난 면접에서 겪은 일' }).success).toBe(
      false,
    );
    expect(readingInputSchema.safeParse({ ...input, experience: '지난 면접에서 겪은 일' }).success).toBe(
      false,
    );
  });

  it('rejects a choice outside the retrieved references and allows retrying the same topic', async () => {
    vi.stubEnv('DEOKDAM_AI_CONTAINER', '1');
    vi.stubEnv('DEOKDAM_AI_MODEL', 'test-model');
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(answer('interview-voice'))
      .mockResolvedValueOnce(answer('scores-break'));
    vi.stubGlobal('fetch', fetch);
    const input = { topic: 'admission', concern: 'scores', element: 'water' } as const;
    await expect(createReading(input)).rejects.toThrow();
    await expect(createReading(input)).resolves.toMatchObject({ mode: 'ai' });
  });

  it('limits new local generations to one at a time and allows the next request when it finishes', async () => {
    vi.stubEnv('DEOKDAM_AI_CONTAINER', '1');
    vi.stubEnv('DEOKDAM_AI_MODEL', 'test-concurrency');
    const loading = Promise.withResolvers<Response>();
    const fetch = vi
      .fn()
      .mockReturnValueOnce(loading.promise)
      .mockResolvedValueOnce(answer('first-words-meal'));
    vi.stubGlobal('fetch', fetch);
    const first = createReading({ topic: 'parent', concern: 'waiting', element: 'wood' });
    const second = { topic: 'parent', concern: 'first-words', element: 'wood' } as const;
    try {
      await expect(createReading(second)).rejects.toThrow('Reading model is busy');
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      loading.resolve(answer('waiting-rhythm'));
      await first;
    }
    await expect(createReading(second)).resolves.toMatchObject({ mode: 'ai' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
