import dayjs from 'dayjs';
import { z } from 'zod';

import { seoulToday } from '@/shared/seoul-time';
import { topics } from '@/shared/topics';

import type { TReading, TReadingInput } from './contracts';
import { experienceThemes } from './experience';
import { basicInterpretation, elementDescriptions } from './interpretation';
import { readingReferences } from './knowledge/corpus';
import { readingKnowledgeFingerprint } from './knowledge/embeddings';
import { findReadingReferences } from './knowledge/store';

const providerResponse = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});
const instructions = [
  '일간 오행의 비유와 현재 고민을 바탕으로, 제공된 실천 중 오늘 해볼 만한 행동을 하나 고르세요.',
  '경험의 주제가 주어지면 그 상황과 연결되는 실천을 우선하세요.',
  '고른 실천의 id를 referenceId에 넣어 JSON으로 답하세요.',
].join(' ');
const cache = new Map<string, { expires: number; result: Promise<TReading> }>();
const oneDayMs = 86_400_000;
let modelBusy = false;

function aiConfig() {
  const model = process.env.DEOKDAM_AI_MODEL?.trim();
  if (!model) return undefined;
  if (process.env.DEOKDAM_AI_CONTAINER === '1') {
    return {
      url: 'http://deokdam-model:8080/v1/chat/completions',
      options: { max_tokens: 48, temperature: 0 },
      model,
    };
  }
  const port = Number(process.env.DEOKDAM_AI_LOCAL_PORT);
  if (!Number.isInteger(port) || port <= 1024 || port >= 65_536) return undefined;
  return {
    url: 'http://127.0.0.1:' + port + '/v1/chat/completions',
    options: { max_completion_tokens: 48, enable_thinking: false, temperature: 0 },
    model,
  };
}

async function generate(
  input: TReadingInput,
  config: NonNullable<ReturnType<typeof aiConfig>>,
): Promise<TReading> {
  const concern = topics[input.topic].concerns.find(({ id }) => id === input.concern);
  const { classical, practices } = findReadingReferences(input);
  const candidates = practices.map(({ id }) => {
    const reference = readingReferences.find((entry) => entry.id === id);
    if (reference?.source !== 'editorial') throw new Error('Missing reading advice');
    return reference;
  });
  const candidateIds = candidates.map(({ id }) => id);
  const selectionSchema = z.object({ referenceId: z.enum(candidateIds) }).strict();
  const element = elementDescriptions[input.element];
  const response = await fetch(config.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(40_000),
    body: JSON.stringify({
      model: config.model,
      ...config.options,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'reading',
          strict: true,
          schema: {
            type: 'object',
            properties: { referenceId: { type: 'string', enum: candidateIds } },
            required: ['referenceId'],
            additionalProperties: false,
          },
        },
      },
      messages: [
        { role: 'system', content: instructions },
        {
          role: 'user',
          content: JSON.stringify({
            topic: topics[input.topic].label,
            concern: concern?.label,
            element: element.label,
            experience: input.experience ? experienceThemes[input.experience].label : undefined,
            classical: { title: classical.title, focus: element.focus },
            practices: candidates.map(({ id, title, advice }) => ({ id, title, advice })),
          }),
        },
      ],
    }),
  });
  if (!response.ok) throw new Error('Reading provider unavailable');
  const body = providerResponse.parse(await response.json());
  const selection = selectionSchema.parse(JSON.parse(body.choices[0]?.message.content ?? 'null'));
  const selected = candidates.find(({ id }) => id === selection.referenceId);
  if (!selected) throw new Error('Missing reading advice');
  return {
    mode: 'ai',
    interpretation: `사주에서 ${element.label}의 비유는 ${element.focus}을 떠올리게 해요. ${selected.advice}`,
    action: selected.title,
    sources: [classical, selected].map(({ id, title }) => ({ id, title })),
  };
}

export async function createReading(input: TReadingInput): Promise<TReading> {
  const config = aiConfig();
  if (!config) return { mode: 'basic', interpretation: basicInterpretation(input) };
  const now = dayjs().valueOf();
  for (const [key, item] of cache) {
    if (item.expires <= now) cache.delete(key);
  }
  const key = [
    seoulToday(),
    config.url,
    config.model,
    readingKnowledgeFingerprint,
    input.topic,
    input.concern,
    input.element,
    input.experience,
  ].join('/');
  const existing = cache.get(key);
  if (existing) return existing.result;
  if (modelBusy) throw new Error('Reading model is busy');

  modelBusy = true;
  const result = generate(input, config);
  cache.set(key, { expires: now + oneDayMs, result });
  try {
    return await result;
  } catch (error) {
    cache.delete(key);
    throw error;
  } finally {
    modelBusy = false;
  }
}
