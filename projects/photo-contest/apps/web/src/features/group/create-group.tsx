'use client';
import { useMutation } from '@apollo/client/react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { CreateGroupDocument } from '@/shared/api/generated';
import { Modal } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { ErrorNotice } from '@/shared/ui/states';
import { errorMessage } from '@/shared/lib/format';
const schema = z.object({
  name: z.string().trim().min(1, '그룹 이름을 입력해 주세요.').max(40, '40자 이내로 입력해 주세요.'),
});
export function CreateGroup() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [create] = useMutation(CreateGroupDocument);
  const router = useRouter();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: '' },
  });
  async function handleCreate(values: z.infer<typeof schema>) {
    setError('');
    try {
      const { data } = await create({
        variables: values,
        update(cache, { data }) {
          if (data)
            cache.modify({
              fields: {
                myGroups(existing = [], { toReference }) {
                  const ref = toReference(data.createGroup);
                  return [ref, ...existing];
                },
              },
            });
        },
      });
      if (data) {
        setOpen(false);
        router.push(`/groups/${data.createGroup.id}`);
        form.reset();
      }
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  return (
    <Modal
      title="우리만의 그룹 만들기"
      description="친구를 초대하고 첫 사진 대회를 열어보세요."
      trigger={
        <>
          <Plus size={18} />
          그룹 만들기
        </>
      }
      open={open}
      onOpenChange={setOpen}
    >
      <form className="form" onSubmit={form.handleSubmit(handleCreate)}>
        <label htmlFor="group-name">
          그룹 이름
          <input id="group-name" placeholder="예: 웃음 참기 연구소" {...form.register('name')} />
        </label>
        {form.formState.errors.name && (
          <p className="field-error" role="alert">
            {form.formState.errors.name.message}
          </p>
        )}
        {error && <ErrorNotice message={error} />}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          그룹 만들기
        </Button>
      </form>
    </Modal>
  );
}
