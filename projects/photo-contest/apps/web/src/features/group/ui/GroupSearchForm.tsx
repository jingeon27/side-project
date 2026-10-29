'use client';

import { useTransition } from 'react';

import { Search } from 'lucide-react';

import { ROUTES } from '@/shared/constants/routes';
import { useZodForm } from '@/shared/model/form';
import { useAppRouter } from '@/shared/model/router';
import { Button } from '@/shared/ui/@core/button';
import { TextField } from '@/shared/ui/@core/text-field';

import { groupSearchSchema } from '../model/group-search.schema';

export function GroupSearchForm({ search = '' }: { search?: string }) {
  const form = useZodForm(groupSearchSchema, { defaultValues: { q: search } });
  const router = useAppRouter();
  const [pending, startTransition] = useTransition();
  return (
    <form
      role="search"
      action={ROUTES.EXPLORE}
      method="get"
      className="flex items-end gap-3"
      noValidate
      onSubmit={(event) => {
        // 브라우저 복원/초기 hydration 중 React change 이벤트가 없었어도 실제 입력값을 검증한다.
        const value = new FormData(event.currentTarget).get('q');
        form.setValue('q', typeof value === 'string' ? value : '');
        void form.handleSubmit(({ q }) => {
          const query = new URLSearchParams(window.location.search);
          query.delete('q');
          if (q) query.set('q', q);
          const search = query.toString();
          const href = `${ROUTES.EXPLORE}${search ? `?${search}` : ''}${window.location.hash}`;
          startTransition(() => router.replace(href));
        })(event);
      }}
    >
      <TextField
        label="그룹 검색"
        labelSuffix={null}
        placeholder="이름으로 그룹을 찾아보세요"
        maxLength={40}
        autoComplete="off"
        className="flex-1"
        error={form.formState.errors.q?.message}
        {...form.register('q')}
      />
      <Button type="submit" variant="accent" size="lg" loading={pending} className="shrink-0 rounded-full">
        <Search aria-hidden className="mr-1 size-4" />
        검색
      </Button>
    </form>
  );
}
