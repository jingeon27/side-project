import { useZodForm } from '@/shared/model/form';

import { commentSchema } from './comment.schema';

export function useCommentForm() {
  return useZodForm(commentSchema, { defaultValues: { body: '' } });
}

export type TCommentForm = ReturnType<typeof useCommentForm>;
