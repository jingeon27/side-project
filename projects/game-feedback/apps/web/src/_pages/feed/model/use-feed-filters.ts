import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useWatch } from 'react-hook-form';
import { z } from 'zod';
import { useZodForm } from '@/shared/model/form';

const feedSearchSchema = z.object({ search: z.string() });

function replaceFilters(pathname: string, params: URLSearchParams) {
  const query = params.toString();
  const href = `${pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState(null, '', href);
}

export function useFeedFilters() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const q = searchParams.get('q')?.trim() ?? '';
  const tab = searchParams.get('tab') === 'unanswered' ? 'unanswered' : 'latest';
  const form = useZodForm(feedSearchSchema, { defaultValues: { search: q } });
  const { control, reset, setValue } = form;
  const search = useWatch({ control, name: 'search' });
  const pendingSearch = useRef<string | null>(null);

  useEffect(() => {
    if (pendingSearch.current === q) {
      pendingSearch.current = null;
      return;
    }
    reset({ search: q });
  }, [q, reset]);

  useEffect(() => {
    const nextSearch = search.trim();
    if (nextSearch === q) return;
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      params.delete('q');
      if (nextSearch) params.set('q', nextSearch);
      pendingSearch.current = nextSearch;
      replaceFilters(pathname, params);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [search, q, pathname]);

  function handleTabChange(nextTab: string) {
    const params = new URLSearchParams(window.location.search);
    params.delete('tab');
    if (nextTab === 'unanswered') params.set('tab', nextTab);
    replaceFilters(pathname, params);
  }

  function handleSearchChange(nextSearch: string) {
    setValue('search', nextSearch, { shouldDirty: true });
  }

  return { tab, q, search, handleTabChange, handleSearchChange };
}
