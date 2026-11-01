import type { ReactNode } from 'react';

import { FormField } from '@side/design-system';

export function Field({
  label,
  children,
  hint,
  error,
  labelSuffix,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
  labelSuffix?: ReactNode;
}) {
  return (
    <FormField label={label} labelSuffix={labelSuffix} description={hint} error={error} className="field">
      {children}
    </FormField>
  );
}
