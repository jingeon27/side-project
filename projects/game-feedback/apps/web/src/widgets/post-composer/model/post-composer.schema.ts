import type { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

import { PostInputSchema } from '@game-feedback/contracts';

export const postComposerSchema = PostInputSchema.extend({
  editorValid: z.boolean().refine(Boolean),
});

export type TPostComposerInput = z.input<typeof postComposerSchema>;
export type TPostComposerValues = z.output<typeof postComposerSchema>;
export type TPostComposerForm = UseFormReturn<TPostComposerInput, unknown, TPostComposerValues>;

/** 게시판별 세부 입력의 기본값. 다른 게시판을 고르면 숨겨진 입력도 이 값으로 되돌린다. */
export const POST_DETAIL_DEFAULTS = {
  coaching: { role: 'COACH', pricing: { type: 'HOURLY', amount: null } },
  friendSale: { price: null },
  battle: { mode: 'DUEL' },
} satisfies Required<Pick<TPostComposerInput, 'coaching' | 'friendSale' | 'battle'>>;
