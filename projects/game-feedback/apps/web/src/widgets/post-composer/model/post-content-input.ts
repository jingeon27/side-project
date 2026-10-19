import type { z } from 'zod';
import type { postComposerSchema } from './post-composer.schema';
export function postContentInput(values: z.output<typeof postComposerSchema>) {
  return {
    title: values.title,
    body: values.body,
    document: values.document ?? null,
    ...(values.board === 'COACHING' ? { coaching: values.coaching } : {}),
    ...(values.board === 'FRIEND_SALE' ? { friendSale: values.friendSale } : {}),
    ...(values.board === 'FRIENDLY' ? { battle: values.battle } : {}),
  };
}
