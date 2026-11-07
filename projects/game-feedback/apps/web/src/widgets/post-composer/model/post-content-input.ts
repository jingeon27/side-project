import { match, P } from 'ts-pattern';

import type { TPostComposerValues } from './post-composer.schema';

export function postContentInput(values: TPostComposerValues) {
  return {
    title: values.title,
    body: values.body,
    document: values.document ?? null,
    ...match(values.board)
      .with('COACHING', () => ({ coaching: values.coaching }))
      .with('FRIEND_SALE', () => ({ friendSale: values.friendSale }))
      .with('FRIENDLY', () => ({ battle: values.battle }))
      .with(P.union('FEEDBACK', 'FREE', undefined), () => ({}))
      .exhaustive(),
  };
}
