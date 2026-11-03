import { omit } from 'es-toolkit';
import qs from 'qs';
import { useWatch } from 'react-hook-form';
import { z } from 'zod';

import { parseSearchValues } from '@/shared/lib/query-string';
import { useZodForm } from '@/shared/model/form';

const searchSchema = z.object({ q: z.string().max(100) });

export function usePostSearch(q: string) {
  const form = useZodForm(searchSchema, { values: { q } });
  const search = useWatch({ control: form.control, name: 'q' });

  function commitSearch(value: string) {
    const search = qs.stringify(
      { ...omit(parseSearchValues(window.location.search), ['q']), q: value || undefined },
      { addQueryPrefix: true, arrayFormat: 'repeat' },
    );
    window.history.replaceState(null, '', `${window.location.pathname}${search}`);
  }

  const handleClear = () => {
    form.setValue('q', '');
    commitSearch('');
    form.setFocus('q');
  };

  const handleSubmit = form.handleSubmit(({ q: value }) => commitSearch(value.trim()));
  return { form, search, handleClear, handleSubmit };
}
