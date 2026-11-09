import { RuleTester } from '@typescript-eslint/rule-tester';

import { languageOptions } from '../../../test/rule-tester';
import { noOverlayState } from './no-overlay-state';

const errors = [{ messageId: 'formStateCopy' }] as const;

new RuleTester({ languageOptions }).run('no-overlay-state의 폼 상태 검사', noOverlayState, {
  valid: [
    `
      import { useState } from 'react';
      const [emailError] = useState(null);
    `,
    `
      import { useState } from 'react';
      import { useForm } from 'react-hook-form';
      const form = useForm();
      const [draft, setDraft] = useState(form.formState.errors.email?.message);
      const handleChange = (value: string) => setDraft(value);
    `,
    {
      code: `
      import { useEffect, useState } from 'react';
      import { useForm } from 'react-hook-form';
      const { formState } = useForm();
      const [submittedError, setSubmittedError] = useState(null);
      useEffect(() => setSubmittedError(formState.errors.email), [formState.submitCount]);
      `,
      options: [{ checkStateNames: false }],
    },
    {
      code: `
      import { useEffect, useState } from 'react';
      import { useFormState } from 'react-hook-form';
      const { errors } = useFormState();
      const [error, setError] = useState(null);
      useEffect(() => {
        if (errors.email) setError(errors.email);
      }, [errors.email]);
      `,
      options: [{ checkStateNames: false }],
    },
    `
      import { useState } from 'react';
      import { useForm } from 'react-hook-form';
      function Example(useForm: () => { formState: { loading: boolean } }) {
        const local = useForm();
        const [loading] = useState(local.formState.loading);
        return loading;
      }
    `,
  ],
  invalid: [
    {
      code: `
        import { useState as keep } from 'react';
        import { useForm as create } from 'react-hook-form';
        const editor = create();
        const [anything] = keep(editor['formState'].isSubmitting);
      `,
      errors,
    },
    {
      code: `
        import React from 'react';
        import { useZodForm as build } from '@/shared/model/form';
        const { formState: { errors: fields } } = build(schema);
        const [emailError] = React.useState(() => fields.email?.message ?? null);
      `,
      errors,
    },
    {
      code: `
        import { useState } from 'react';
        import { useFormContext } from 'react-hook-form';
        const editor = useFormContext();
        const formStatus = editor.formState;
        const [valid] = useState(() => { return formStatus.isValid; });
      `,
      errors,
    },
    {
      code: `
        import { useEffect as sync, useState } from 'react';
        import { useFormState } from 'react-hook-form';
        const formStatus = useFormState();
        const issue = formStatus.errors.email?.message;
        const [emailError, update] = useState(null);
        sync(() => { update(issue ?? null); }, [formStatus]);
      `,
      errors,
    },
    {
      code: `
        import { useLayoutEffect, useState } from 'react';
        import { useZodForm } from '@/shared/model';
        const form = useZodForm(schema);
        const [submitError, update] = useState(form.formState.errors.root?.message);
        useLayoutEffect(() => update(form.formState.errors.root?.message), [form.formState.errors.root?.message]);
      `,
      errors,
    },
  ],
});
