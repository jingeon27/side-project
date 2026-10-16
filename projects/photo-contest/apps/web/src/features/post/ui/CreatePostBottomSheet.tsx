'use client';

import { useMutation } from '@apollo/client/react';
import { useId } from 'react';

import { ImagePrepareError, browserImageCodec, prepareUploadImage } from '@/features/submission';
import {
  CreatePostDocument,
  GalleryPostsDocument,
  RequestPostUploadDocument,
  UploadPostMediaDocument,
} from '@/shared/api/generated';
import { useZodForm } from '@/shared/model/form';
import { toast } from '@/shared/model/toast';
import { BottomSheet, type IBottomSheetControlProps } from '@/shared/ui/@core/bottom-sheet';
import { Button } from '@/shared/ui/@core/button';
import { FieldRequirement, TextArea, TextField } from '@/shared/ui/@core/text-field';

import { resetGalleryPosts } from '../model/post.cache';
import { postSchema } from '../model/post.schema';
import { PostMediaField } from './PostMediaField';

export function CreatePostBottomSheet({
  groupId,
  isOpen,
  onClose,
  unmount,
}: IBottomSheetControlProps & { groupId: string }) {
  const formId = useId();
  const rightsErrorId = useId();
  const form = useZodForm(postSchema, {
    defaultValues: { title: '', body: '', media: null, rightsConfirmed: false },
  });
  const [uploadMedia] = useMutation(UploadPostMediaDocument);
  const [requestUpload] = useMutation(RequestPostUploadDocument);
  const [createPost] = useMutation(CreatePostDocument, {
    update: resetGalleryPosts,
    refetchQueries: [GalleryPostsDocument],
    awaitRefetchQueries: true,
  });

  const { errors, isSubmitting } = form.formState;
  return (
    <BottomSheet.Root isOpen={isOpen} onClose={onClose} unmount={unmount}>
      <BottomSheet.Header
        title="그룹에 글쓰기"
        description="사진도 동영상도, 직접 찍은 순간도 합성도 환영해요."
      />
      <BottomSheet.Content>
        <form
          id={formId}
          noValidate
          onSubmit={form.handleSubmit(async ({ title, body, media: file, rightsConfirmed }) => {
            try {
              const content = file.type.startsWith('video/')
                ? { body: file, contentType: file.type }
                : await prepareUploadImage(file, browserImageCodec);
              const { data } = await requestUpload({ variables: { groupId } });
              if (!data) return;
              await uploadMedia({ variables: { uploadId: data.requestPostUpload.id, file: content.body } });
              await createPost({
                variables: { groupId, uploadId: data.requestPostUpload.id, title, body, rightsConfirmed },
              });
              toast.success('게시물을 올렸어요');
              onClose();
            } catch (error) {
              if (error instanceof ImagePrepareError)
                form.setError('media', { message: error.message }, { shouldFocus: true });
            }
          })}
          className="flex flex-col gap-4"
        >
          <TextField
            label="제목"
            required
            maxLength={80}
            error={errors.title?.message}
            {...form.register('title')}
          />
          <PostMediaField control={form.control} trigger={form.trigger} />
          <TextArea
            label="내용"
            rows={4}
            maxLength={5000}
            placeholder="이 순간의 웃음 포인트는…"
            error={errors.body?.message}
            {...form.register('body')}
          />
          <label className="flex min-h-touch items-start gap-3 text-body text-ink">
            <input
              type="checkbox"
              required
              className="mt-1 size-5 shrink-0 accent-brand"
              aria-invalid={Boolean(errors.rightsConfirmed)}
              aria-describedby={errors.rightsConfirmed ? rightsErrorId : undefined}
              {...form.register('rightsConfirmed')}
            />
            <span>
              <FieldRequirement required /> 공유할 권리가 있고 촬영된 사람의 동의를 확인했습니다. 그룹
              멤버에게 공개됩니다.
            </span>
          </label>
          {errors.rightsConfirmed ? (
            <p id={rightsErrorId} role="alert" className="text-caption text-danger">
              {errors.rightsConfirmed.message}
            </p>
          ) : null}
        </form>
      </BottomSheet.Content>
      <BottomSheet.Footer>
        <Button type="submit" form={formId} fullWidth loading={isSubmitting}>
          게시물 올리기
        </Button>
      </BottomSheet.Footer>
    </BottomSheet.Root>
  );
}
