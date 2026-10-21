'use client';

import { useFragment, useMutation, useQuery } from '@apollo/client/react';
import { Field } from '@base-ui/react/field';
import { ArrowUp } from 'lucide-react';
import { useWatch } from 'react-hook-form';

import {
  CreatePostCommentDocument,
  GalleryPostCardFragmentDoc,
  MeDocument,
  PostCommentsDocument,
  RefreshPostDocument,
} from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { useZodForm } from '@/shared/model/form';
import { Avatar } from '@/shared/ui/@core/avatar';
import { Button, ButtonLink } from '@/shared/ui/@core/button';
import { FieldRequirement } from '@/shared/ui/@core/text-field';

import { commentSchema } from '../model/comment.schema';

export function PostCommentComposer({ postId }: { postId: string }) {
  const { data } = useQuery(MeDocument, { fetchPolicy: 'cache-only' });
  const { data: post, complete } = useFragment({
    fragment: GalleryPostCardFragmentDoc,
    from: { __typename: 'GalleryPost', id: postId },
  });
  const form = useZodForm(commentSchema, { defaultValues: { body: '' } });
  const body = useWatch({ control: form.control, name: 'body' });
  const [create] = useMutation(CreatePostCommentDocument, {
    refetchQueries: [PostCommentsDocument, { query: RefreshPostDocument, variables: { id: postId } }],
    awaitRefetchQueries: true,
    onCompleted: () => form.reset(),
  });
  const { errors, isSubmitting } = form.formState;
  if (!complete) return null;
  if (!post.canInteract)
    return (
      <ButtonLink href={ROUTES.GROUP(post.groupId)} variant="secondary" fullWidth>
        그룹에 가입하고 댓글 남기기
      </ButtonLink>
    );

  return (
    <form
      noValidate
      className="mx-auto flex w-full max-w-3xl items-start gap-3"
      onSubmit={form.handleSubmit(async (values) => {
        try {
          await create({ variables: { postId, ...values } });
        } catch {
          /* ErrorLink가 알리고 입력은 유지한다. */
        }
      })}
    >
      <Avatar name={data?.me?.nickname ?? '나'} src={data?.me?.avatar} size="sm" className="mt-2" />
      <Field.Root invalid={Boolean(errors.body)} disabled={isSubmitting} className="group min-w-0 flex-1">
        <div className="flex items-end gap-2 rounded-card border border-line-strong bg-sunken p-1 focus-within:border-ink group-data-invalid:border-danger">
          <Field.Control
            required
            render={
              <textarea
                {...form.register('body')}
                required
                disabled={isSubmitting}
                rows={1}
                maxLength={1000}
                placeholder="댓글을 남겨보세요."
                className="max-h-32 min-h-touch w-full min-w-0 flex-1 resize-none field-sizing-content bg-transparent px-3 py-3 text-input text-ink outline-none placeholder:text-subtle"
              />
            }
          />
          <Button
            type="submit"
            size="md"
            aria-label="댓글 올리기"
            loading={isSubmitting}
            className="size-touch rounded-full p-0"
          >
            <ArrowUp aria-hidden className="size-5" />
          </Button>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3 px-1 text-micro text-muted">
          <div className="flex items-center">
            <Field.Label>댓글</Field.Label>
            <FieldRequirement required />
          </div>
          <span aria-hidden>{body.length} / 1,000</span>
        </div>
        <Field.Error
          match={Boolean(errors.body)}
          role="alert"
          className="mt-1 block text-caption text-danger"
        >
          {errors.body?.message}
        </Field.Error>
      </Field.Root>
    </form>
  );
}
