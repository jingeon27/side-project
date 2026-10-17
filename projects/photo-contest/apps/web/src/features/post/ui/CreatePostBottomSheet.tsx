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
  const [createPost, { data: created }] = useMutation(CreatePostDocument, {
    update: resetGalleryPosts,
    refetchQueries: [GalleryPostsDocument],
    awaitRefetchQueries: true,
  });

  const { errors, isSubmitting } = form.formState;
  return (
    <BottomSheet.Root
      isOpen={isOpen}
      onClose={onClose}
      unmount={() => {
        unmount?.();
        if (!created?.createPost) return;
        // 시트의 스크롤 잠금이 해제된 다음 새 글이 있는 목록 위로 이동한다.
        requestAnimationFrame(() => window.scrollTo({ top: 0 }));
      }}
      className="desktop:h-[85dvh]"
    >
      <div className="mx-auto w-full max-w-6xl shrink-0">
        <BottomSheet.Header
          title="그룹에 글쓰기"
          description="사진도 동영상도, 직접 찍은 순간도 합성도 환영해요."
        />
      </div>
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
          className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 desktop:grid-cols-2 desktop:grid-rows-[auto_auto_1fr] desktop:items-start desktop:gap-x-10 desktop:gap-y-5"
        >
          <TextField
            label="제목"
            className="desktop:col-start-2 desktop:row-start-1"
            required
            maxLength={80}
            error={errors.title?.message}
            {...form.register('title')}
          />
          <div className="desktop:col-start-1 desktop:row-span-3 desktop:row-start-1">
            <PostMediaField control={form.control} trigger={form.trigger} />
          </div>
          <TextArea
            label="내용"
            className="desktop:col-start-2 desktop:row-start-2"
            rows={4}
            maxLength={5000}
            placeholder="이 순간의 웃음 포인트는…"
            error={errors.body?.message}
            {...form.register('body')}
          />
          <div className="desktop:col-start-2 desktop:row-start-3">
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
          </div>
        </form>
      </BottomSheet.Content>
      <BottomSheet.Footer>
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
          <p className="hidden text-caption text-muted desktop:block">그룹 멤버에게만 공개돼요.</p>
          <Button
            type="submit"
            form={formId}
            fullWidth
            loading={isSubmitting}
            className="desktop:w-auto desktop:min-w-40"
          >
            게시물 올리기
          </Button>
        </div>
      </BottomSheet.Footer>
    </BottomSheet.Root>
  );
}
