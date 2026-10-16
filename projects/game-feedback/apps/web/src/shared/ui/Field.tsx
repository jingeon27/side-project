import { FormField } from '@side/design-system';
import type { ReactNode } from 'react';
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <FormField label={label} hint={hint} className="field">
      {children}
    </FormField>
  );
}
