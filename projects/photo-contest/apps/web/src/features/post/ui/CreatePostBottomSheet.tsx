'use client';

import { CombinedGraphQLErrors, ServerError, ServerParseError } from '@apollo/client/errors';
import { useMutation } from '@apollo/client/react';
import { Controller, useWatch } from 'react-hook-form';
import { useId } from 'react';

import { ImagePrepareError, browserImageCodec, prepareUploadImage } from '@/features/submission';
import { CreatePostDocument, GalleryPostsDocument, RequestPostUploadDocument } from '@/shared/api/generated';
import { ensureOk, RequestError, getErrorMessage } from '@/shared/model/error';
import { useZodForm } from '@/shared/model/form';
import { toast } from '@/shared/model/toast';
import { BottomSheet, type IBottomSheetControlProps } from '@/shared/ui/@core/bottom-sheet';
import { Button } from '@/shared/ui/@core/button';
import { TextArea, TextField } from '@/shared/ui/@core/text-field';

import { resetGalleryPosts } from '../model/post.cache';
import { postSchema } from '../model/post.schema';

export function CreatePostBottomSheet({
  groupId,
  isOpen,
  onClose,
  unmount,
}: IBottomSheetControlProps & { groupId: string }) {
  const formId = useId();
  const mediaErrorId = useId();
  const rightsErrorId = useId();
  const form = useZodForm(postSchema, {
    defaultValues: { title: '', body: '', media: null, rightsConfirmed: false },
  });
  const media = useWatch({ control: form.control, name: 'media' });
  const [requestUpload] = useMutation(RequestPostUploadDocument);
  const [createPost] = useMutation(CreatePostDocument, {
    update: resetGalleryPosts,
    refetchQueries: [GalleryPostsDocument],
    awaitRefetchQueries: true,
  });
  const handleSubmit = form.handleSubmit(async ({ title, body, media: file, rightsConfirmed }) => {
    try {
      const content = file.type.startsWith('video/')
        ? { body: file, contentType: file.type }
        : await prepareUploadImage(file, browserImageCodec);
      const { data } = await requestUpload({ variables: { groupId } });
      if (!data) return;
      await ensureOk(
        await fetch(data.requestPostUpload.url, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': content.contentType },
          body: content.body,
        }),
      );
      await createPost({
        variables: { groupId, uploadId: data.requestPostUpload.id, title, body, rightsConfirmed },
      });
      toast.success('게시물을 올렸어요');
      onClose();
    } catch (error) {
      if (error instanceof ImagePrepareError)
        form.setError('media', { message: error.message }, { shouldFocus: true });
      else if (
        error instanceof RequestError ||
        (!CombinedGraphQLErrors.is(error) && !ServerError.is(error) && !ServerParseError.is(error))
      )
        toast.error(getErrorMessage(error));
    }
  });
  const { errors, isSubmitting } = form.formState;
  return (
    <BottomSheet.Root isOpen={isOpen} onClose={onClose} unmount={unmount}>
      <BottomSheet.Header
        title="갤러리에 글쓰기"
        description="사진도 동영상도, 직접 찍은 순간도 합성도 환영해요."
      />
      <BottomSheet.Content>
        <form id={formId} noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
          <TextField label="제목" maxLength={80} error={errors.title?.message} {...form.register('title')} />
          <Controller
            control={form.control}
            name="media"
            render={({ field }) => (
              <div className="flex flex-col gap-2">
                <label className="flex min-h-touch cursor-pointer flex-col gap-2 rounded-control border border-dashed border-line-strong bg-sunken p-4 text-body text-ink">
                  사진·동영상 선택
                  <input
                    type="file"
                    accept="image/*,.heic,.heif,video/mp4,video/webm"
                    aria-label="사진·동영상 선택"
                    ref={field.ref}
                    name={field.name}
                    onBlur={() => field.onBlur()}
                    disabled={isSubmitting}
                    aria-invalid={Boolean(errors.media)}
                    aria-describedby={errors.media ? mediaErrorId : undefined}
                    onChange={(event) => {
                      field.onChange(event.currentTarget.files?.[0] ?? null);
                      event.currentTarget.value = '';
                    }}
                    className="max-w-full text-caption"
                  />
                  <span className="text-caption text-muted">
                    {media?.name ?? '사진은 자동으로 줄여요. 동영상 MP4(H.264)·WebM · 100MB · 5분 이하'}
                  </span>
                </label>
                {errors.media ? (
                  <p id={mediaErrorId} role="alert" className="text-caption text-danger">
                    {errors.media.message}
                  </p>
                ) : null}
              </div>
            )}
          />
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
              className="mt-1 size-5 shrink-0 accent-brand"
              aria-invalid={Boolean(errors.rightsConfirmed)}
              aria-describedby={errors.rightsConfirmed ? rightsErrorId : undefined}
              {...form.register('rightsConfirmed')}
            />
            공유할 권리가 있고 촬영된 사람의 동의를 확인했습니다. 갤러리 멤버에게 공개됩니다.
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
