'use client';

import { useMutation } from '@apollo/client/react';
import { ImagePlus } from 'lucide-react';
import { Controller, useWatch } from 'react-hook-form';
import { useEffect, useId, useRef, useState } from 'react';

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
import { PostMediaPreview } from './PostMediaPreview';

export function CreatePostBottomSheet({
  groupId,
  isOpen,
  onClose,
  unmount,
}: IBottomSheetControlProps & { groupId: string }) {
  const formId = useId();
  const mediaErrorId = useId();
  const mediaHelpId = useId();
  const rightsErrorId = useId();
  const previewUrlRef = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const form = useZodForm(postSchema, {
    defaultValues: { title: '', body: '', media: null, rightsConfirmed: false },
  });
  const media = useWatch({ control: form.control, name: 'media' });
  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );
  const handlePreviewChange = (file: File | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current =
      file && postSchema.shape.media.safeParse(file).success ? URL.createObjectURL(file) : null;
    setPreviewUrl(previewUrlRef.current);
  };
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
        title="갤러리에 글쓰기"
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
          <Controller
            control={form.control}
            name="media"
            render={({ field }) => (
              <div className="flex flex-col gap-2">
                <label className="flex min-h-touch cursor-pointer flex-col gap-2 rounded-control border border-dashed border-line-strong bg-sunken p-4 text-body text-ink transition-colors has-focus-visible:border-brand has-focus-visible:outline-3 has-focus-visible:outline-accent hover:bg-neutral-soft active:bg-neutral-soft">
                  <span>
                    사진·동영상 선택
                    <FieldRequirement required />
                  </span>
                  <input
                    type="file"
                    aria-required="true"
                    accept="image/*,.heic,.heif,video/mp4,video/webm"
                    aria-label="사진·동영상 선택"
                    ref={field.ref}
                    name={field.name}
                    onBlur={() => field.onBlur()}
                    disabled={isSubmitting}
                    aria-invalid={Boolean(errors.media)}
                    aria-describedby={errors.media ? `${mediaHelpId} ${mediaErrorId}` : mediaHelpId}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = '';
                      if (!file) return;
                      field.onChange(file);
                      handlePreviewChange(file);
                      void form.trigger('media');
                    }}
                    className="sr-only"
                  />
                  <span className="flex min-h-touch items-center gap-2 text-label text-ink">
                    <ImagePlus aria-hidden className="size-5" />
                    {media ? '파일 바꾸기' : '파일 선택'}
                  </span>
                  <span id={mediaHelpId} className="text-caption text-muted">
                    사진은 자동으로 줄여요. 동영상 MP4(H.264)·WebM · 100MB · 5분 이하
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
          {media && previewUrl ? (
            <PostMediaPreview
              key={previewUrl}
              file={media}
              src={previewUrl}
              onRemove={() => {
                handlePreviewChange(null);
                form.setValue('media', null, { shouldValidate: true, shouldDirty: true });
              }}
            />
          ) : null}
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
              <FieldRequirement required /> 공유할 권리가 있고 촬영된 사람의 동의를 확인했습니다. 갤러리
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
