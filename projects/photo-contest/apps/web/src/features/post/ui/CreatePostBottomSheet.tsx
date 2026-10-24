'use client';

import { useId } from 'react';

import { useMutation } from '@apollo/client/react';

import { browserImageCodec, ImagePrepareError, prepareUploadImage } from '@/features/submission';
import {
  CompletePostUploadDocument,
  CreatePostDocument,
  GroupContestDocument,
  GroupContestsDocument,
  RequestPostUploadDocument,
} from '@/shared/api/generated';
import { StorageUploadError, uploadToStorage } from '@/shared/api/upload-to-storage.helper';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { notifyClosedSubmit, throwIfClosed, useAbortOnClose, useZodForm } from '@/shared/model/form';
import { toast } from '@/shared/model/toast';
import { BottomSheet, type IBottomSheetControlProps } from '@/shared/ui/@core/bottom-sheet';
import { Button } from '@/shared/ui/@core/button';
import { FieldRequirement, TextArea, TextField } from '@/shared/ui/@core/text-field';

import { isTooLongVideo, readVideoDuration } from '../lib/video-duration.helper';
import { POST_FEED_QUERIES, resetGalleryPosts } from '../model/post.cache';
import { postSchema } from '../model/post.schema';
import { PostCategoryField } from './PostCategoryField';
import { PostContestField } from './PostContestField';
import { PostLinkField } from './PostLinkField';
import { PostMediaField } from './PostMediaField';

export function CreatePostBottomSheet({
  groupId,
  defaultContestId,
  isOpen,
  onClose,
  unmount,
}: IBottomSheetControlProps & { groupId: string; defaultContestId?: string }) {
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
  const [createPost, { data: created }] = useMutation(CreatePostDocument, {
    update: resetGalleryPosts,
    refetchQueries: [...POST_FEED_QUERIES, GroupContestDocument, GroupContestsDocument],
    awaitRefetchQueries: true,
  });
  const beginSubmit = useAbortOnClose(isOpen);

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
                let uploadId: string | undefined;
                if (file) {
                  if (file.type.startsWith('video/') && isTooLongVideo(await readVideoDuration(file))) {
                    form.setError(
                      'media',
                      { message: '5분 이하의 동영상을 선택해 주세요.' },
                      { shouldFocus: true },
                    );
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
                  uploadId = data.requestPostUpload.id;
                }
                // 게시는 되돌릴 수 없으므로 닫힌 시트에서는 보내지 않는다. 보낸 뒤에는 결과를 토스트로 알린다.
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
                if (posted)
                  trackEvent(ANALYTICS_EVENT.PostCreated, {
                    group_id: groupId,
                    category_id: categoryId || null,
                    kind: posted.createPost.kind,
                  });
                toast.success('게시물을 올렸어요');
                onClose();
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
          <div className="flex flex-col gap-4 desktop:col-start-2 desktop:row-start-3">
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
        </form>
      </BottomSheet.Content>
      <BottomSheet.Footer>
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
      </BottomSheet.Footer>
    </BottomSheet.Root>
  );
}
