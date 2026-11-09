import { RuleTester } from '@typescript-eslint/rule-tester';

import { languageOptions } from '../../../test/rule-tester';
import { noFormStateCopy } from './no-form-state-copy';

const errors = [{ messageId: 'formStateCopy' }] as const;

new RuleTester({ languageOptions }).run('no-form-state-copy', noFormStateCopy, {
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
    `
      import { useEffect, useState } from 'react';
      import { useForm } from 'react-hook-form';
      const { formState } = useForm();
      const [submittedError, setSubmittedError] = useState(null);
      useEffect(() => setSubmittedError(formState.errors.email), [formState.submitCount]);
    `,
    `
      import { useEffect, useState } from 'react';
      import { useFormState } from 'react-hook-form';
      const { errors } = useFormState();
      const [error, setError] = useState(null);
      useEffect(() => {
        if (errors.email) setError(errors.email);
      }, [errors.email]);
    `,
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
        const [anything, update] = useState(form.formState.isSubmitting);
        useLayoutEffect(() => update(form.formState.isSubmitting), [form.formState.isSubmitting]);
      `,
      errors,
    },
  ],
});
