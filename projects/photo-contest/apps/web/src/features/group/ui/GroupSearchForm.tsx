'use client';

import { Search } from 'lucide-react';
import { useTransition } from 'react';

import { ROUTES } from '@/shared/constants/routes';
import { useZodForm } from '@/shared/model/form';
import { useAppRouter } from '@/shared/model/router';
import { Button } from '@/shared/ui/@core/button';
import { TextField } from '@/shared/ui/@core/text-field';

import { groupSearchSchema } from '../model/group-search.schema';

export function GroupSearchForm({ search = '' }: { search?: string }) {
  const form = useZodForm(groupSearchSchema, { defaultValues: { search } });
  const router = useAppRouter();
  const [pending, startTransition] = useTransition();
  return (
    <form
      role="search"
      className="flex items-end gap-3"
      noValidate
      onSubmit={form.handleSubmit(({ search: value }) => {
        const query = new URLSearchParams();
        if (value) query.set('q', value);
        startTransition(() => router.replace(`${ROUTES.EXPLORE}${value ? `?${query}` : ''}`));
      })}
    >
      <TextField
        label="그룹 검색"
        placeholder="이름으로 그룹을 찾아보세요"
        maxLength={40}
        autoComplete="off"
        className="flex-1"
        error={form.formState.errors.search?.message}
        {...form.register('search')}
      />
      <Button type="submit" loading={pending} className="shrink-0">
        <Search aria-hidden className="mr-1 size-4" />
        검색
      </Button>
    </form>
  );
}
