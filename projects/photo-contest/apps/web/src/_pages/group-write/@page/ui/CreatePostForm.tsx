'use client';

import { useId } from 'react';

import { useMutation } from '@apollo/client/react';

import { POST_FEED_QUERIES, resetGalleryPosts } from '@/features/post';
import {
  CompletePostUploadDocument,
  CreatePostDocument,
  GroupContestDocument,
  GroupContestsDocument,
  RequestPostUploadDocument,
} from '@/shared/api/generated';
import { StorageUploadError, uploadToStorage } from '@/shared/api/upload-to-storage.helper';
import { browserImageCodec, ImagePrepareError, prepareUploadImage } from '@/shared/lib/image.helper';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { notifyClosedSubmit, throwIfClosed, useAbortOnClose, useZodForm } from '@/shared/model/form';
import { toast } from '@/shared/model/toast';
import { Button } from '@/shared/ui/@core/button';
import { StickyCta } from '@/shared/ui/@core/sticky-cta';
import { FieldRequirement, TextArea, TextField } from '@/shared/ui/@core/text-field';

import { isTooLongVideo, readVideoDuration } from '../lib/video-duration.helper';
import { postSchema } from '../model/post.schema';
import { PostMediaField } from './fields/media/PostMediaField';
import { PostCategoryField } from './fields/PostCategoryField';
import { PostContestField } from './fields/PostContestField';
import { PostLinkField } from './fields/PostLinkField';

export function CreatePostForm({
  groupId,
  defaultContestId,
  onCreated,
}: {
  groupId: string;
  defaultContestId?: string;
  onCreated: (postId: string) => void;
}) {
  const formId = useId();
  const rightsErrorId = useId();
  const form = useZodForm(postSchema, {
    defaultValues: {
      participateInContest: Boolean(defaultContestId),
      categoryId: '',
      contestId: defaultContestId ?? '',
      title: '',
      body: '',
      media: null,
      linkUrl: '',
      rightsConfirmed: false,
    },
  });
  const [completeUpload] = useMutation(CompletePostUploadDocument);
  // 서명된 업로드 정책은 한 번만 쓰는 값이라 정규화 캐시에 남기지 않는다.
  const [requestUpload] = useMutation(RequestPostUploadDocument, { fetchPolicy: 'no-cache' });
  const [createPost] = useMutation(CreatePostDocument, {
    update: resetGalleryPosts,
    refetchQueries: [...POST_FEED_QUERIES, GroupContestDocument, GroupContestsDocument],
    awaitRefetchQueries: true,
  });
  const beginSubmit = useAbortOnClose(true);

  const uploadMedia = async (file: File, signal: AbortSignal) => {
    if (file.type.startsWith('video/') && isTooLongVideo(await readVideoDuration(file))) {
      form.setError('media', { message: '5분 이하의 동영상을 선택해 주세요.' }, { shouldFocus: true });
      return;
    }
    const content = file.type.startsWith('video/')
      ? { body: file, contentType: file.type }
      : await prepareUploadImage(file, browserImageCodec);
    throwIfClosed(signal);
    const { data } = await requestUpload({
      variables: { groupId, contentType: content.contentType, byteSize: content.body.size },
    });
    if (!data) return;
    await uploadToStorage(data.requestPostUpload, content.body, { signal });
    const { data: completed } = await completeUpload({
      variables: { uploadId: data.requestPostUpload.id },
    });
    if (!completed) return;
    return data.requestPostUpload.id;
  };

  const { errors, isSubmitting } = form.formState;
  return (
    <form
      id={formId}
      aria-label="그룹에 글쓰기"
      noValidate
      onSubmit={form.handleSubmit(
        async ({
          title,
          body,
          media: file,
          linkUrl,
          rightsConfirmed,
          participateInContest,
          contestId,
          categoryId,
        }) => {
          const signal = beginSubmit();
          try {
            const uploadId = file ? await uploadMedia(file, signal) : undefined;
            if (file && !uploadId) return;
            // 페이지를 떠났으면 업로드 후 게시 요청을 보내지 않는다.
            throwIfClosed(signal);
            const { data: posted } = await createPost({
              variables: {
                groupId,
                categoryId: categoryId || null,
                uploadId,
                linkUrl: linkUrl || null,
                title,
                body,
                rightsConfirmed,
                ...(participateInContest ? { contestId } : {}),
              },
            });
            if (!posted) return;
            trackEvent(ANALYTICS_EVENT.PostCreated, {
              group_id: groupId,
              category_id: categoryId || null,
              kind: posted.createPost.kind,
            });
            toast.success('게시물을 올렸어요');
            if (!signal.aborted) onCreated(posted.createPost.id);
          } catch (error) {
            if (signal.aborted) {
              notifyClosedSubmit('게시물을 올리지 않았어요');
              return;
            }
            if (error instanceof ImagePrepareError || error instanceof StorageUploadError)
              form.setError('media', { message: error.message }, { shouldFocus: true });
          }
        },
      )}
      className="flex min-h-0 min-w-0 flex-1 flex-col [&_input]:scroll-mt-6 [&_input]:scroll-mb-6 [&_select]:scroll-mt-6 [&_select]:scroll-mb-6 [&_textarea]:scroll-mt-6 [&_textarea]:scroll-mb-6"
    >
      <div
        data-form-scroll
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-6 scroll-py-6 tablet:px-8"
      >
        <div className="mx-auto grid w-full min-w-0 max-w-5xl grid-cols-1 gap-4 desktop:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] desktop:grid-rows-[auto_auto_1fr] desktop:items-start desktop:gap-x-10 desktop:gap-y-5">
          <TextField
            label="제목"
            className="desktop:col-start-2 desktop:row-start-1"
            required
            maxLength={80}
            error={errors.title?.message}
            {...form.register('title')}
          />
          <div className="min-w-0 desktop:col-start-1 desktop:row-span-3 desktop:row-start-1">
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
          <div className="flex min-w-0 flex-col gap-4 desktop:col-start-2 desktop:row-start-3">
            <PostLinkField form={form} />
            <PostCategoryField form={form} groupId={groupId} />
            <PostContestField groupId={groupId} form={form} />
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
                <FieldRequirement required /> 공유할 권리가 있고 촬영된 사람의 동의를 확인했습니다. 그룹의
                공개 범위에 따라 게시됩니다.
              </span>
            </label>
            {errors.rightsConfirmed ? (
              <p id={rightsErrorId} role="alert" className="text-caption text-danger">
                {errors.rightsConfirmed.message}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <StickyCta className="tablet:px-8" contentClassName="max-w-5xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
          <p className="hidden text-caption text-muted desktop:block">그룹의 공개 범위에 따라 게시돼요.</p>
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
      </StickyCta>
    </form>
  );
}
