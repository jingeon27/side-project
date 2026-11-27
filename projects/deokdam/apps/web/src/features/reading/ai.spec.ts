import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createReading } from './ai';
import { readingInputSchema } from './contracts';
import { findReadingReferences } from './knowledge/store';

describe('reading provider', () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'deokdam-knowledge-'));
    vi.stubEnv('DEOKDAM_READING_DB', join(directory, 'knowledge.sqlite'));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    rmSync(directory, { recursive: true, force: true });
  });

  it('provides a labeled basic reading with zero provider requests in an unconfigured environment', async () => {
    vi.stubEnv('DEOKDAM_AI_API_KEY', '');
    vi.stubEnv('DEOKDAM_AI_MODEL', '');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const result = await createReading({ topic: 'parent', concern: 'waiting', element: 'wood' });
    expect(result).toMatchObject({ mode: 'basic' });
    expect(result.interpretation).toContain('목(木)');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shares a daily request and sends only the reading choices and retrieved reference texts', async () => {
    vi.stubEnv('DEOKDAM_AI_API_KEY', 'test');
    vi.stubEnv('DEOKDAM_AI_MODEL', 'test-model');
    const text = '오늘은 기다리는 마음을 살피며 주변에 작은 도움을 청해도 좋아요.';
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ choices: [{ message: { content: JSON.stringify({ interpretation: text }) } }] }),
      );
    vi.stubGlobal('fetch', fetch);
    const input = { topic: 'job', concern: 'silence', element: 'metal' } as const;
    const results = await Promise.all([createReading(input), createReading(input)]);
    expect(results[0]).toMatchObject({
      mode: 'ai',
      interpretation: text,
      sources: [{ id: 'metal' }, { id: 'silence-trim' }],
    });
    expect(results[1]).toEqual(results[0]);
    expect(fetch).toHaveBeenCalledTimes(1);
    const request = JSON.parse(fetch.mock.calls[0]?.[1].body);
    const prompt = JSON.parse(request.messages[1].content);
    expect(Object.keys(prompt).sort()).toEqual(['concern', 'element', 'references', 'topic']);
    expect(prompt).toMatchObject({
      topic: '취업 준비',
      concern: '지원했는데 답장이 없어요',
      element: '금(金)',
      references: [
        { title: results[0].sources?.[0]?.title, source: 'classical' },
        { title: results[0].sources?.[1]?.title, source: 'editorial' },
      ],
    });
    expect(prompt.references[1].text).toContain('최근 공고');
  });

  it('ranks different references for the same concern and persists a single copy of the corpus', () => {
    const input = { topic: 'job', concern: 'silence' } as const;
    expect(findReadingReferences({ ...input, element: 'earth' }).map(({ id }) => id)).toEqual([
      'earth',
      'silence-rhythm',
    ]);
    expect(findReadingReferences({ ...input, element: 'wood' }).map(({ id }) => id)).toEqual([
      'wood',
      'silence-next',
    ]);
    const database = new DatabaseSync(join(directory, 'knowledge.sqlite'), { readOnly: true });
    try {
      expect(database.prepare('SELECT count(*) AS count FROM reading_references').get()?.count).toBe(26);
      expect(database.prepare('SELECT count(*) AS count FROM reading_queries').get()?.count).toBe(42);
    } finally {
      database.close();
    }
  });

  it('passes a fixed experience theme to the model and rejects freeform experience input', async () => {
    vi.stubEnv('DEOKDAM_AI_API_KEY', 'test');
    vi.stubEnv('DEOKDAM_AI_MODEL', 'test-experience');
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                interpretation:
                  '화의 이미지처럼 지난 면접에서 말하기에 도움이 됐던 방법을 한 가지 되짚어 보세요.',
              }),
            },
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const input = { topic: 'job', concern: 'interview', element: 'fire', experience: 'interview' } as const;
    await expect(createReading(input)).resolves.toMatchObject({ mode: 'ai' });
    const request = JSON.parse(fetch.mock.calls[0]?.[1].body);
    expect(JSON.parse(request.messages[1].content).experience).toBe('면접이나 발표에 관한 과거 경험');
    expect(readingInputSchema.safeParse({ ...input, pastExperience: '지난 면접에서 겪은 일' }).success).toBe(
      false,
    );
    expect(readingInputSchema.safeParse({ ...input, experience: '지난 면접에서 겪은 일' }).success).toBe(
      false,
    );
  });

  it('rejects a guarantee and allows retrying the same topic', async () => {
    vi.stubEnv('DEOKDAM_AI_API_KEY', 'test');
    vi.stubEnv('DEOKDAM_AI_MODEL', 'test-model');
    const answer = (interpretation: string) =>
      Response.json({ choices: [{ message: { content: JSON.stringify({ interpretation }) } }] });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(answer('이 방법으로 하면 당신의 대학 합격을 반드시 보장합니다.'))
      .mockResolvedValueOnce(answer('수의 상징처럼 상황을 천천히 살피며 가까운 사람과 이야기해도 좋아요.'));
    vi.stubGlobal('fetch', fetch);
    const input = { topic: 'admission', concern: 'scores', element: 'water' } as const;
    await expect(createReading(input)).rejects.toThrow();
    await expect(createReading(input)).resolves.toMatchObject({ mode: 'ai' });
  });
});
