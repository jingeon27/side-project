'use client';
import { useMutation } from '@apollo/client/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { CreateSubmissionDocument, RequestUploadDocument } from '@/shared/api/generated';
import { Modal } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { ErrorNotice } from '@/shared/ui/states';
import { errorMessage } from '@/shared/lib/format';
const schema = z.object({
  photo: z
    .custom<FileList>()
    .refine((v) => v?.length === 1, '사진 한 장을 선택해 주세요.')
    .refine((v) => !v?.[0] || v[0].size <= 10 * 1024 * 1024, '10MB 이하의 사진을 선택해 주세요.')
    .refine(
      (v) => !v?.[0] || ['image/jpeg', 'image/png', 'image/webp'].includes(v[0].type),
      'JPEG, PNG, WebP 사진만 가능해요.',
    ),
  caption: z.string().trim().min(1, '사진 설명을 입력해 주세요.').max(160, '160자 이내로 입력해 주세요.'),
  rights: z.boolean().refine((v) => v, '권리와 동의를 확인해 주세요.'),
});
export function UploadPhoto({ contestId }: { contestId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [ticket] = useMutation(RequestUploadDocument);
  const [submit] = useMutation(CreateSubmissionDocument);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { caption: '', rights: false },
  });
  async function handleSubmit(values: z.infer<typeof schema>) {
    setError('');
    try {
      const file = values.photo[0];
      if (!file) return;
      const { data } = await ticket({ variables: { contestId } });
      if (!data) throw new Error('업로드 요청을 만들지 못했습니다.');
      const response = await fetch(data.requestUploadUrl.url, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!response.ok) throw new Error((await response.json()).message ?? '사진 업로드에 실패했습니다.');
      await submit({
        variables: {
          contestId,
          uploadId: data.requestUploadUrl.id,
          caption: values.caption,
          rightsConfirmed: values.rights,
        },
        refetchQueries: ['Contest', 'MorePhotos'],
        awaitRefetchQueries: true,
      });
      setOpen(false);
      form.reset();
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  return (
    <Modal
      title="내 웃긴 순간 제출하기"
      description="한 대회에 한 장만 제출할 수 있어요. 신중하게 골라주세요."
      trigger={
        <>
          <ImagePlus size={18} />
          사진 제출하기
        </>
      }
      open={open}
      onOpenChange={setOpen}
    >
      <form className="form" onSubmit={form.handleSubmit(handleSubmit)}>
        <label htmlFor="photo">
          사진 선택
          <input
            id="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            {...form.register('photo')}
          />
        </label>
        <p className="muted small">JPEG, PNG, WebP · 최대 10MB</p>
        {form.formState.errors.photo && (
          <p className="field-error" role="alert">
            {form.formState.errors.photo.message}
          </p>
        )}
        <label htmlFor="caption">
          사진 설명
          <textarea id="caption" placeholder="이 사진의 웃음 포인트는…" {...form.register('caption')} />
        </label>
        {form.formState.errors.caption && (
          <p className="field-error" role="alert">
            {form.formState.errors.caption.message}
          </p>
        )}
        <label className="checkbox-label">
          <input type="checkbox" {...form.register('rights')} />
          <span>
            이 사진을 공유할 권리가 있고, 촬영된 사람의 동의를 확인했습니다. 그룹 멤버에게만 공개됩니다.
          </span>
        </label>
        {form.formState.errors.rights && (
          <p className="field-error" role="alert">
            {form.formState.errors.rights.message}
          </p>
        )}
        {error && <ErrorNotice message={error} />}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? '사진을 올리는 중…' : '사진 제출하기'}
        </Button>
      </form>
    </Modal>
  );
}
