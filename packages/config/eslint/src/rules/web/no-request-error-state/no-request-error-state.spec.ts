import { RuleTester } from '@typescript-eslint/rule-tester';

import { languageOptions } from '../../../test/rule-tester';
import { noRequestErrorState } from './no-request-error-state';

const errors = [{ messageId: 'requestErrorState' }] as const;

new RuleTester({ languageOptions }).run('no-request-error-state', noRequestErrorState, {
  valid: [
    'const { error } = useMutation();',
    'const [hasLoadError] = useState(false); const [emailError] = useState(null);',
    `
      import { useState } from 'react';
      import { useForm } from 'react-hook-form';
      const form = useForm();
      const [submitError] = useState(form.formState.errors.root?.message);
    `,
  ],
  invalid: [
    { code: "const [error] = useState('');", errors },
    { code: "const [uploadError] = React['useState']('');", errors },
    {
      code: "import { useState as keep } from 'react'; const [submitError] = keep<string | null>(null);",
      errors,
    },
  ],
});
