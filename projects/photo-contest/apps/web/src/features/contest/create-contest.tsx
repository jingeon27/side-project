'use client';
import { useMutation } from '@apollo/client/react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { CreateContestDocument, GroupDocument } from '@/shared/api/generated';
import { Modal } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { ErrorNotice } from '@/shared/ui/states';
import { errorMessage, localDate } from '@/shared/lib/format';
export const contestFormSchema = z
  .object({
    title: z.string().trim().min(1, '대회 제목을 입력해 주세요.').max(80, '80자 이내로 입력해 주세요.'),
    startsAt: z.string().min(1),
    submissionEndsAt: z.string().min(1),
    endsAt: z.string().min(1),
  })
  .refine(
    (v) =>
      Number.isFinite(Date.parse(v.startsAt)) &&
      new Date(v.startsAt) < new Date(v.submissionEndsAt) &&
      new Date(v.submissionEndsAt) < new Date(v.endsAt),
    { message: '시작 → 제출 마감 → 투표 마감 순서로 설정해 주세요.', path: ['endsAt'] },
  );
export function CreateContest({ groupId }: { groupId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [create] = useMutation(CreateContestDocument);
  const router = useRouter();
  const form = useForm<z.infer<typeof contestFormSchema>>({
    resolver: zodResolver(contestFormSchema),
    defaultValues: { title: '', startsAt: '', submissionEndsAt: '', endsAt: '' },
  });
  function handleOpen(next: boolean) {
    setOpen(next);
    if (next) {
      form.reset({
        title: '',
        startsAt: localDate(new Date()),
        submissionEndsAt: localDate(new Date(Date.now() + 3 * 86400_000)),
        endsAt: localDate(new Date(Date.now() + 7 * 86400_000)),
      });
      setError('');
    }
  }
  async function handleCreate(values: z.infer<typeof contestFormSchema>) {
    setError('');
    try {
      const { data } = await create({
        variables: {
          groupId,
          title: values.title,
          startsAt: new Date(values.startsAt).toISOString(),
          submissionEndsAt: new Date(values.submissionEndsAt).toISOString(),
          endsAt: new Date(values.endsAt).toISOString(),
        },
        refetchQueries: [{ query: GroupDocument, variables: { id: groupId } }],
      });
      if (data) {
        setOpen(false);
        router.push(`/contests/${data.createContest.id}`);
      }
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  return (
    <Modal
      title="새 사진 대회 열기"
      description="제출 기간이 끝나면 투표가 자동으로 시작돼요."
      trigger={
        <>
          <Plus size={18} />
          대회 열기
        </>
      }
      open={open}
      onOpenChange={handleOpen}
    >
      <form className="form" onSubmit={form.handleSubmit(handleCreate)}>
        <label htmlFor="contest-title">
          대회 제목
          <input id="contest-title" placeholder="이번 주 가장 웃긴 순간" {...form.register('title')} />
        </label>
        {form.formState.errors.title && (
          <p className="field-error" role="alert">
            {form.formState.errors.title.message}
          </p>
        )}
        <label htmlFor="starts-at">
          시작 시각
          <input id="starts-at" type="datetime-local" {...form.register('startsAt')} />
        </label>
        <label htmlFor="submission-ends-at">
          사진 제출 마감
          <input id="submission-ends-at" type="datetime-local" {...form.register('submissionEndsAt')} />
        </label>
        <label htmlFor="ends-at">
          투표 마감
          <input id="ends-at" type="datetime-local" {...form.register('endsAt')} />
        </label>
        {form.formState.errors.endsAt && (
          <p className="field-error" role="alert">
            {form.formState.errors.endsAt.message}
          </p>
        )}
        <p className="muted small">
          입력 시각은 기기의 시간대 기준입니다. 대회는 최대 90일 동안 진행할 수 있어요.
        </p>
        {error && <ErrorNotice message={error} />}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          대회 열기
        </Button>
      </form>
    </Modal>
  );
}
