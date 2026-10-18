import { useEffect, useRef } from 'react';
import { useBrowserSearch } from '@/shared/navigation';
import { useFormContext, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { useZodForm } from '@/shared/model/form';

const feedSearchSchema = z.object({ search: z.string(), tab: z.enum(['latest', 'unanswered']) });
type TFeedFilters = z.infer<typeof feedSearchSchema>;

function replaceFilters(pathname: string, params: URLSearchParams) {
  const query = params.toString();
  const href = `${pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState(null, '', href);
}

export function useFeedFilters() {
  const form = useZodForm(feedSearchSchema, { defaultValues: { search: '', tab: 'latest' } });
  const { search, tab } = useWatch({ control: form.control });

  function handleTabChange(nextTab: string) {
    const params = new URLSearchParams(window.location.search);
    params.delete('tab');
    if (nextTab === 'unanswered') params.set('tab', nextTab);
    form.setValue('tab', nextTab === 'unanswered' ? 'unanswered' : 'latest');
    replaceFilters(window.location.pathname, params);
  }

  function handleSearchChange(nextSearch: string) {
    form.setValue('search', nextSearch, { shouldDirty: true });
  }

  return { form, tab: tab ?? 'latest', search: search ?? '', handleTabChange, handleSearchChange };
}

// Only this synchronization reads URL data, so the search controls stay in the app shell.
export function useSyncFeedFilters() {
  const searchParams = new URLSearchParams(useBrowserSearch());
  const q = searchParams.get('q')?.trim().slice(0, 100) ?? '';
  const tab = searchParams.get('tab') === 'unanswered' ? 'unanswered' : 'latest';
  const { control, getFieldState, resetField, setValue } = useFormContext<TFeedFilters>();
  const search = useWatch({ control, name: 'search' });
  const pendingSearch = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const browserQ = new URLSearchParams(window.location.search).get('q')?.trim().slice(0, 100) ?? '';
    if (browserQ !== q) return;
    const previous = pendingSearch.current;
    pendingSearch.current = null;
    if (previous === undefined && getFieldState('search').isDirty) return;
    if (previous === q) return;
    resetField('search', { defaultValue: q });
  }, [q, getFieldState, resetField]);

  useEffect(() => {
    setValue('tab', tab);
  }, [tab, setValue]);

  useEffect(() => {
    const nextSearch = search.trim();
    if (nextSearch === q) return;
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      params.delete('q');
      if (nextSearch) params.set('q', nextSearch);
      pendingSearch.current = nextSearch;
      replaceFilters(window.location.pathname, params);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [search, q]);
}
