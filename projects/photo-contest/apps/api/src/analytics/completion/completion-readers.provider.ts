import type { FactoryProvider } from '@nestjs/common';

import { COMPLETION_READERS, type TCompletionReaders } from './completion-reader';
import { LegacyCompletionReader } from './legacy-completion.reader';
import { PostCompletionReader } from './post-completion.reader';

function createCompletionReaders(post: PostCompletionReader, legacy: LegacyCompletionReader) {
  return { POST: post, LEGACY: legacy } satisfies TCompletionReaders;
}

export const completionReadersProvider = {
  provide: COMPLETION_READERS,
  inject: [PostCompletionReader, LegacyCompletionReader],
  useFactory: createCompletionReaders,
} satisfies FactoryProvider<TCompletionReaders>;
