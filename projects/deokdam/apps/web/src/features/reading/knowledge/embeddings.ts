import { createHash } from 'node:crypto';

import { topics, topicSchema } from '@/shared/topics';

import { elementSchema, type TReadingInput } from '../contracts';
import { experienceThemes, experienceThemeSchema, type TExperienceTheme } from '../experience';
import { elementDescriptions } from '../interpretation';
import { readingReferences } from './corpus';

export const readingEmbeddingModel = {
  id: 'intfloat/multilingual-e5-small',
  revision: '614241f622f53c4eeff9890bdc4f31cfecc418b3',
  dimensions: 384,
  encoding: 'symmetric-int8',
} as const;

export function readingQueryKey(input: TReadingInput) {
  return ['query', input.topic, input.concern, input.element].join('/');
}

const concernQueries = topicSchema.options.flatMap((topic) =>
  topics[topic].concerns.flatMap((concern) =>
    elementSchema.options.map((element) => {
      const symbol = elementDescriptions[element];
      return {
        key: readingQueryKey({ topic, concern: concern.id, element }),
        text:
          'query: ' +
          topics[topic].label +
          '. ' +
          concern.label +
          '. 일간 오행 ' +
          symbol.label +
          '. ' +
          symbol.focus +
          '을 살릴 실천.',
      };
    }),
  ),
);

export function experienceQueryKey(theme: TExperienceTheme) {
  return 'experience/' + theme;
}

export const readingQueries = [
  ...concernQueries,
  ...experienceThemeSchema.options.map((theme) => ({
    key: experienceQueryKey(theme),
    text: 'query: ' + experienceThemes[theme].label + '. ' + experienceThemes[theme].followUp,
  })),
];

export const readingEmbeddingInputs = [
  ...readingReferences.map((reference) => ({
    key: reference.id,
    text: 'passage: ' + reference.title + '. ' + reference.text,
  })),
  ...readingQueries,
];

export const readingKnowledgeFingerprint = createHash('sha256')
  .update(
    JSON.stringify({ model: readingEmbeddingModel, references: readingReferences, queries: readingQueries }),
  )
  .digest('hex');
