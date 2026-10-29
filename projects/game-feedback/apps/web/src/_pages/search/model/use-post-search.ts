import { useWatch } from 'react-hook-form';
import { z } from 'zod';

import { useZodForm } from '@/shared/model/form';

const searchSchema = z.object({ q: z.string().max(100) });

export function usePostSearch(q: string) {
  const form = useZodForm(searchSchema, { values: { q } });
  const search = useWatch({ control: form.control, name: 'q' });

  function commitSearch(value: string) {
    const params = new URLSearchParams(window.location.search);
    params.delete('q');
    if (value) params.set('q', value);
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }

  const handleClear = () => {
    form.setValue('q', '');
    commitSearch('');
    form.setFocus('q');
  };

  const handleSubmit = form.handleSubmit(({ q: value }) => commitSearch(value.trim()));
  return { form, search, handleClear, handleSubmit };
}
