import type { ReactNode } from 'react';

import { FormField } from '@side/design-system';

export function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <FormField label={label} description={hint} error={error} className="field">
      {children}
    </FormField>
  );
}
