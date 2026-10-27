'use client';

import { useId } from 'react';
import Image from 'next/image';

import { useMutation } from '@apollo/client/react';
import { ImagePlus } from 'lucide-react';
import { Controller, useWatch } from 'react-hook-form';

import {
  CompleteSubmissionUploadDocument,
  CreateSubmissionDocument,
  RequestUploadDocument,
  SubmissionsDocument,
} from '@/shared/api/generated';
import { StorageUploadError, uploadToStorage } from '@/shared/api/upload-to-storage.helper';
import { browserImageCodec, ImagePrepareError, prepareUploadImage } from '@/shared/lib/image.helper';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { notifyClosedSubmit, throwIfClosed, useAbortOnClose, useZodForm } from '@/shared/model/form';
import { useObjectUrl } from '@/shared/model/object-url.hook';
import { toast } from '@/shared/model/toast';
import { BottomSheet, type IBottomSheetControlProps } from '@/shared/ui/@core/bottom-sheet';
import { Button } from '@/shared/ui/@core/button';
import { FieldRequirement, TextArea } from '@/shared/ui/@core/text-field';

import { markContestSubmitted } from '../model/submission.cache';
import { uploadPhotoSchema } from '../model/submission.schema';

const FORM_ID = 'upload-photo-form';
/** 휴대폰 갤러리의 HEIC도 고를 수 있게 한다(브라우저가 디코드하면 JPEG로 바꿔 올린다). */
const PHOTO_ACCEPT = 'image/*,.heic,.heif';

interface IUploadPhotoBottomSheetProps extends IBottomSheetControlProps {
  contestId: string;
}

/**
 * 내 사진 제출: 브라우저에서 줄이기 → 일회용 업로드 주소 받기 → 원본 올리기 → 제출 만들기.
 * 사진을 고르면 미리 보여 주고(시트가 사라지면 미리보기 주소를 풀어 준다), 제출하면 시트를 닫고 피드에 바로 보인다.
 */
export function UploadPhotoBottomSheet({
  contestId,
  isOpen,
  onClose,
  unmount,
}: IUploadPhotoBottomSheetProps) {
  const photoErrorId = useId();
  const rightsErrorId = useId();
  const form = useZodForm(uploadPhotoSchema, {
    defaultValues: { photo: null, caption: '', rightsConfirmed: false },
  });
  // 시트가 사라지거나 다른 사진을 고르면 이전 미리보기 주소를 풀어 준다.
  const previewUrl = useObjectUrl(useWatch({ control: form.control, name: 'photo' }));
  const [completeUpload] = useMutation(CompleteSubmissionUploadDocument);
  // 서명된 업로드 정책은 한 번만 쓰는 값이라 정규화 캐시에 남기지 않는다.
  const [requestUpload] = useMutation(RequestUploadDocument, { fetchPolicy: 'no-cache' });
  const [createSubmission] = useMutation(CreateSubmissionDocument, {
    update: (cache, { data }) => {
      if (data) markContestSubmitted(cache, contestId, data.createSubmission.id);
    },
    // 제출한 사진이 바로 보이도록 열려 있는 피드를 첫 페이지부터 다시 받는다.
    refetchQueries: [SubmissionsDocument],
    awaitRefetchQueries: true,
    onCompleted: () => {
      trackEvent(ANALYTICS_EVENT.PhotoSubmitted, { contest_id: contestId });
      toast.success('사진을 제출했어요', { description: '친구들의 사진을 기다려 볼까요?' });
      onClose();
    },
  });
  const beginSubmit = useAbortOnClose(isOpen);

  const { errors, isSubmitting } = form.formState;
  return (
    <BottomSheet.Root isOpen={isOpen} onClose={onClose} unmount={unmount}>
      <BottomSheet.Header
        title="내 웃긴 순간 제출하기"
        description="직접 찍은 사진도 합성도 환영해요. 한 대회에 한 장만 제출할 수 있어요."
      />
      <BottomSheet.Content>
        <form
          id={FORM_ID}
          onSubmit={form.handleSubmit(async ({ photo, caption, rightsConfirmed }) => {
            const signal = beginSubmit();
            try {
              const image = await prepareUploadImage(photo, browserImageCodec);
              throwIfClosed(signal);
              const { data } = await requestUpload({
                variables: { contestId, contentType: image.body.type, byteSize: image.body.size },
              });
              if (!data) return;
              await uploadToStorage(data.requestUploadUrl, image.body, { signal });
              await completeUpload({ variables: { uploadId: data.requestUploadUrl.id } });
              // 제출은 되돌릴 수 없으므로 닫힌 시트에서는 보내지 않는다.
              throwIfClosed(signal);
              await createSubmission({
                variables: { contestId, uploadId: data.requestUploadUrl.id, caption, rightsConfirmed },
              });
            } catch (error) {
              if (signal.aborted) {
                notifyClosedSubmit('사진을 제출하지 않았어요');
                return;
              }
              // GraphQL 실패는 ErrorLink가 이미 알렸다. 사진 변환·업로드 실패만 여기서 알린다.
              if (error instanceof ImagePrepareError || error instanceof StorageUploadError)
                form.setError('photo', { message: error.message }, { shouldFocus: true });
            }
          })}
          noValidate
          className="flex flex-col gap-4"
        >
          <Controller
            control={form.control}
            name="photo"
            render={({ field }) => (
              <div className="flex flex-col gap-1.5">
                <label className="relative flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-card border-2 border-dashed border-line-strong bg-sunken text-muted transition-colors has-focus-visible:border-brand has-focus-visible:outline-3 has-focus-visible:outline-accent hover:bg-neutral-soft">
                  <input
                    ref={field.ref}
                    name={field.name}
                    type="file"
                    aria-required="true"
                    accept={PHOTO_ACCEPT}
                    aria-label="사진 선택"
                    aria-invalid={Boolean(errors.photo)}
                    aria-describedby={errors.photo ? photoErrorId : undefined}
                    disabled={isSubmitting}
                    className="sr-only"
                    onBlur={() => field.onBlur()}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0] ?? null;
                      // 같은 사진을 다시 골라도 change가 일어나게 비운다.
                      event.currentTarget.value = '';
                      if (!file) return;
                      field.onChange(file);
                      void form.trigger('photo');
                    }}
                  />
                  {previewUrl ? (
                    // 고른 사진의 로컬 미리보기(blob URL)라 최적화를 거치지 않는다.
                    <Image
                      src={previewUrl}
                      alt="고른 사진 미리보기"
                      fill
                      unoptimized
                      sizes="(max-width: 540px) 100vw, 540px"
                      className="object-cover"
                    />
                  ) : (
                    <>
                      <ImagePlus aria-hidden className="size-8" />
                      <span className="text-label text-ink">
                        사진 선택
                        <FieldRequirement required />
                      </span>
                      <span className="text-caption">JPEG, PNG, WebP, HEIC · 큰 사진은 줄여서 올려요</span>
                    </>
                  )}
                  {previewUrl ? (
                    <span className="absolute right-3 bottom-3 rounded-badge bg-ink/80 px-2 py-1 text-micro text-on-brand">
                      사진 바꾸기
                    </span>
                  ) : null}
                </label>
                {errors.photo ? (
                  <p id={photoErrorId} role="alert" className="text-caption text-danger">
                    {errors.photo.message}
                  </p>
                ) : null}
              </div>
            )}
          />
          <TextArea
            required
            label="사진 설명"
            placeholder="이 사진의 웃음 포인트는…"
            rows={3}
            maxLength={160}
            error={errors.caption?.message}
            {...form.register('caption')}
          />
          <div className="flex flex-col gap-1.5">
            <label className="flex min-h-touch cursor-pointer items-start gap-3 text-body text-ink">
              <input
                type="checkbox"
                required
                aria-invalid={Boolean(errors.rightsConfirmed)}
                aria-describedby={errors.rightsConfirmed ? rightsErrorId : undefined}
                className="mt-0.5 size-5 shrink-0 accent-brand"
                {...form.register('rightsConfirmed')}
              />
              <span>
                <FieldRequirement required /> 이 사진을 공유할 권리가 있고, 촬영된 사람의 동의를 확인했습니다.
                그룹 멤버에게만 공개됩니다.
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
        <Button type="submit" form={FORM_ID} fullWidth loading={isSubmitting}>
          사진 제출하기
        </Button>
      </BottomSheet.Footer>
    </BottomSheet.Root>
  );
}
