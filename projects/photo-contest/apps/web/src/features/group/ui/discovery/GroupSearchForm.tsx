'use client';

import { useTransition } from 'react';
import { useSearchParams } from 'next/navigation';

import { Search } from 'lucide-react';

import { ROUTES } from '@/shared/constants/routes';
import { updateSearch } from '@/shared/lib/query-string.helper';
import { useZodForm } from '@/shared/model/form';
import { useAppRouter } from '@/shared/model/router';
import { Button } from '@/shared/ui/@core/button';
import { TextField } from '@/shared/ui/@core/text-field';

import { groupSearchSchema } from '../../model/group-search.schema';

export function GroupSearchForm() {
  const searchParams = useSearchParams();
  const form = useZodForm(groupSearchSchema, { defaultValues: { q: searchParams.get('q') ?? '' } });
  const router = useAppRouter();
  const [pending, startTransition] = useTransition();
  return (
    <form
      role="search"
      action={ROUTES.EXPLORE}
      method="get"
      className="flex items-end gap-3"
      noValidate
      aria-busy={pending}
      onSubmit={form.handleSubmit(({ q }) => {
        const { search, hash } = window.location;
        // 기존 q를 지운 뒤 마지막에 붙여 다른 키의 순서를 그대로 둔다.
        const next = updateSearch(updateSearch(search, { q: null }), { q: q || null });
        startTransition(() => router.replace(`${ROUTES.EXPLORE}${next}${hash}`));
      })}
    >
      <TextField
        label="그룹 검색"
        labelSuffix={null}
        placeholder="이름으로 그룹을 찾아보세요"
        maxLength={40}
        autoComplete="off"
        className="min-w-0 flex-1 [&_input:not([aria-invalid=true]):not(:focus)]:border-muted"
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
