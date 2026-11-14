'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

import { useApolloClient, useMutation } from '@apollo/client/react';
import { overlay } from 'overlay-kit';

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
import { registerLeaveGuard } from '@/shared/model/router';
import { toast } from '@/shared/model/toast';
import { Button } from '@/shared/ui/@core/button';
import { ConfirmDialog } from '@/shared/ui/@core/confirm-dialog';
import { StickyCta } from '@/shared/ui/@core/sticky-cta';
import { FieldRequirement, TextArea, TextField } from '@/shared/ui/@core/text-field';

import { uploadMediaSize } from '../lib/upload-media-size.helper';
import { isTooLongVideo, readVideoMetadata } from '../lib/video-metadata.helper';
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
  const client = useApolloClient();
  const form = useZodForm(postSchema, {
    defaultValues: {
      clientRequestId: crypto.randomUUID(),
      completedMedia: null,
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
  });
  const beginSubmit = useAbortOnClose(true);
  // 큰 동영상은 몇 분씩 걸려 저장소로 보낸 비율을 보여 준다. 게시 요청 전에 화면을 떠나면 게시가 멈추므로
  // 파일을 준비할 때부터 게시를 마칠 때까지 머물라는 안내도 이 값으로 보여 준다. 파일을 올리는 중이 아니면 null이다.
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  // 게시 요청 전에 누르는 취소. 이번 제출의 전송을 끊는 함수이며 제출하는 동안 누르기 전까지만 있다.
  const [cancelUpload, setCancelUpload] = useState<(() => void) | null>(null);
  // 취소 버튼은 누르면 사라지므로 포커스를 옆의 제출 버튼으로 옮긴다.
  const submitRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const { errors, isDirty, isSubmitting } = form.formState;

  // 입력을 바꾼 뒤 앱바·앱 뒤로 가기를 누르면 버릴지 묻는다. 게시 중에는 등록하지 않아 성공 뒤 이동을 막지 않는다.
  useEffect(() => {
    if (!isDirty || isSubmitting) return;
    return registerLeaveGuard(pathname, async () => {
      const discard = await overlay.openAsync<boolean>(({ isOpen, close, unmount }) => (
        <ConfirmDialog
          isOpen={isOpen}
          onClose={() => close(false)}
          unmount={unmount}
          title="작성 중인 글을 버릴까요?"
          description="나가면 입력한 내용과 고른 파일이 사라져요."
          confirmLabel="글 버리고 나가기"
          cancelLabel="계속 쓰기"
          tone="danger"
          onConfirm={() => close(true)}
        />
      ));
      if (!discard) return false;
      trackEvent(ANALYTICS_EVENT.PostDraftDiscarded, { group_id: groupId });
      // 화면은 Activity로 남아 다시 돌아올 수 있으므로 버린 초안을 실제로 비운다.
      form.reset({ ...form.formState.defaultValues, clientRequestId: crypto.randomUUID() });
      return true;
    });
  }, [form, groupId, isDirty, isSubmitting, pathname]);

  const uploadMedia = async (file: File, signal: AbortSignal) => {
    const completedMedia = form.getValues('completedMedia');
    if (completedMedia?.file === file) return completedMedia.uploadId;
    const video = file.type.startsWith('video/') ? await readVideoMetadata(file) : null;
    if (isTooLongVideo(video?.seconds ?? null)) {
      form.setError('media', { message: '5분 이하의 동영상을 선택해 주세요.' }, { shouldFocus: true });
      return;
    }
    setUploadPercent(0);
    const content = video
      ? { body: file, contentType: file.type, size: video.size }
      : await prepareUploadImage(file, browserImageCodec);
    throwIfClosed(signal);
    const size = uploadMediaSize(content.size);
    const { data } = await requestUpload({
      variables: {
        groupId,
        contentType: content.contentType,
        byteSize: content.body.size,
        width: size?.width,
        height: size?.height,
      },
    });
    if (!data) return;
    await uploadToStorage(data.requestPostUpload, content.body, {
      signal,
      onProgress: (ratio) => setUploadPercent(Math.floor(ratio * 100)),
    });
    // 마지막 진행 이벤트가 오지 않아도 다 보냈으면 100%로 두고 업로드 완료와 게시를 기다린다.
    setUploadPercent(100);
    const { data: completed } = await completeUpload({
      variables: { uploadId: data.requestPostUpload.id },
    });
    if (!completed) return;
    form.setValue('completedMedia', { file, uploadId: data.requestPostUpload.id });
    return data.requestPostUpload.id;
  };

  return (
    <form
      id={formId}
      aria-label="그룹에 글쓰기"
      noValidate
      onSubmit={form.handleSubmit(
        async ({
          clientRequestId,
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
          const cancel = new AbortController();
          signal.addEventListener('abort', () => cancel.abort(), { once: true });
          // 이미 끊긴 전송(취소했거나 화면을 떠남)은 다시 세지 않아 이벤트가 한 번만 나간다.
          setCancelUpload(() => () => {
            if (cancel.signal.aborted) return;
            trackEvent(ANALYTICS_EVENT.PostUploadCancelled, {
              group_id: groupId,
              kind: file?.type.startsWith('video/') ? 'VIDEO' : 'PHOTO',
            });
            cancel.abort();
          });
          try {
            const uploadId = file ? await uploadMedia(file, cancel.signal) : undefined;
            if (file && !uploadId) return;
            // 페이지를 떠났거나 취소를 눌렀으면 업로드 후 게시 요청을 보내지 않는다.
            throwIfClosed(cancel.signal);
            const { data: posted } = await createPost({
              variables: {
                clientRequestId,
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
            void client
              .refetchQueries({
                include: [...POST_FEED_QUERIES, GroupContestDocument, GroupContestsDocument],
              })
              .catch(() => toast.error('게시물은 저장됐지만 목록을 불러오지 못했어요. 새로고침해 주세요.'));
            trackEvent(ANALYTICS_EVENT.PostCreated, {
              group_id: groupId,
              category_id: categoryId || null,
              kind: posted.createPost.kind,
            });
            toast.success('게시물을 올렸어요');
            // 성공한 작성만 새 요청으로 시작하고 실패한 요청의 재시도 키는 유지한다.
            form.reset({ ...form.formState.defaultValues, clientRequestId: crypto.randomUUID() });
            if (!signal.aborted) onCreated(posted.createPost.id);
          } catch (error) {
            if (signal.aborted) {
              notifyClosedSubmit('게시물을 올리지 않았어요');
              return;
            }
            // 직접 취소했으면 알림 없이 입력을 그대로 두어 다시 올리게 한다.
            if (cancel.signal.aborted) return;
            if (error instanceof ImagePrepareError || error instanceof StorageUploadError)
              form.setError('media', { message: error.message }, { shouldFocus: true });
          } finally {
            setCancelUpload(null);
            setUploadPercent(null);
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
            <PostContestField groupId={groupId} form={form} defaultContestId={defaultContestId} />
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
                공유할 권리가 있고 촬영된 사람의 동의를 확인했습니다. 그룹의 공개 범위에 따라 게시됩니다.
                <FieldRequirement required />
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
        {uploadPercent === null ? null : (
          <p role="status" className="mb-3 text-caption text-muted">
            다 올릴 때까지 이 화면에 머물러 주세요.
          </p>
        )}
        {/* 주 행동 하나면 읽기 폭을 채우고, 올리는 중에는 취소와 같은 너비로 나란히 둔다. */}
        <div className="flex flex-row gap-3 [&>*]:min-w-0 [&>*]:flex-1">
          {cancelUpload && uploadPercent !== null && uploadPercent < 100 ? (
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => {
                cancelUpload();
                // 사진 준비나 티켓 요청은 끊어도 그 단계가 끝나야 제출이 끝나므로, 취소와 진행 표시는 기다리지 않고 바로 거둔다.
                setCancelUpload(null);
                setUploadPercent(null);
                submitRef.current?.focus();
              }}
            >
              취소
            </Button>
          ) : null}
          <Button ref={submitRef} type="submit" form={formId} fullWidth loading={isSubmitting}>
            {uploadPercent === null ? '게시물 올리기' : `올리는 중 ${uploadPercent}%`}
          </Button>
        </div>
      </StickyCta>
    </form>
  );
}
