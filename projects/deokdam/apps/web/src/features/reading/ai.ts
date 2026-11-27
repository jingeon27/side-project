import dayjs from 'dayjs';
import { z } from 'zod';

import { seoulToday } from '@/shared/seoul-time';
import { topics } from '@/shared/topics';

import type { TReading, TReadingInput } from './contracts';
import { experienceThemes } from './experience';
import { basicInterpretation, elementDescriptions } from './interpretation';
import { readingKnowledgeFingerprint } from './knowledge/embeddings';
import { findReadingReferences } from './knowledge/store';

const providerResponse = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});
const normalResult = z.object({
  interpretation: z
    .string()
    .trim()
    .min(20)
    .max(300)
    .refine((value) => !/보장|반드시|무조건|합격률|성공률|복채|사망|죽음|저주|\d+\s*%/.test(value)),
});
const instructions = [
  '첫 문장에 제공된 일간 오행 표기를 그대로 쓰고, 고전 자료에 나온 구체적인 이미지를 설명한다.',
  '둘째 문장에 그 이미지와 편집 자료를 연결해 지금 할 수 있는 행동 한 가지를 제안한다. 일상적인 한국어 해요체로 80~150자를 쓴다.',
  '과거 경험의 주제가 있으면 그때 해본 방법을 떠올릴 수 있게 제안한다. 사용자가 겪은 사건의 세부 내용이나 결과는 만들어 내지 않는다.',
  '독자에게 바로 말하듯 쓴다. ‘편집 자료’, ‘선택지’, ‘입력’ 등 서비스 내부 용어를 풀이에 적지 않는다.',
  '제공된 일간 오행만 사용하고 성격을 단정하거나 원국의 다른 글자, 용신, 대운을 추정하지 않는다.',
  '고민은 아래에 제공한 선택지에서만 읽는다. 합격, 탈락, 연락, 시험 성적, 미래, 질병을 예측하거나 보장하지 않는다.',
  '사용자를 탓하지 않는다. 금전, 광고, 추가 리포트, 구매를 권하지 않는다.',
  'JSON 객체 하나로 답하고 interpretation 키에 해석을 넣는다.',
].join(' ');
const cache = new Map<string, { expires: number; result: Promise<TReading> }>();
const oneDayMs = 86_400_000;

function aiConfig() {
  const model = process.env.DEOKDAM_AI_MODEL?.trim();
  if (!model) return undefined;
  const port = Number(process.env.DEOKDAM_AI_LOCAL_PORT);
  if (Number.isInteger(port) && port > 1024 && port < 65_536) {
    return {
      url: 'http://127.0.0.1:' + port + '/v1/chat/completions',
      headers: {},
      options: { max_completion_tokens: 220, enable_thinking: false, temperature: 0.45 },
      model,
      timeout: 40_000,
    };
  }
  const key = process.env.DEOKDAM_AI_API_KEY?.trim();
  if (!key) return undefined;
  return {
    url: 'https://api.openai.com/v1/chat/completions',
    headers: { authorization: 'Bearer ' + key },
    options: { store: false, max_completion_tokens: 600 },
    model,
    timeout: 10_000,
  };
}

async function generate(
  input: TReadingInput,
  config: NonNullable<ReturnType<typeof aiConfig>>,
): Promise<TReading> {
  const concern = topics[input.topic].concerns.find(({ id }) => id === input.concern);
  const references = findReadingReferences(input);
  const headers = new Headers({ 'content-type': 'application/json' });
  if (config.headers.authorization) headers.set('authorization', config.headers.authorization);
  const response = await fetch(config.url, {
    method: 'POST',
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(config.timeout),
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
            properties: { interpretation: { type: 'string' } },
            required: ['interpretation'],
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
            element: elementDescriptions[input.element].label,
            experience: input.experience ? experienceThemes[input.experience].label : undefined,
            references: references.map(({ title, text, source }) => ({ title, text, source })),
          }),
        },
      ],
    }),
  });
  if (!response.ok) throw new Error('Reading provider unavailable');
  const body = providerResponse.parse(await response.json());
  const result = normalResult.parse(JSON.parse(body.choices[0]?.message.content ?? 'null'));
  return {
    mode: 'ai',
    interpretation: result.interpretation,
    sources: references.map(({ id, title }) => ({ id, title })),
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

  const result = generate(input, config);
  cache.set(key, { expires: now + oneDayMs, result });
  try {
    return await result;
  } catch (error) {
    cache.delete(key);
    throw error;
  }
}
