import { FormField } from '@side/design-system';
import type { ReactNode } from 'react';
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
    <FormField label={label} hint={hint} error={error} className="field">
      {children}
    </FormField>
  );
}
