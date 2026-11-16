import type { TPostComposerForm } from './post-composer.schema';

type TInvalidHandler = NonNullable<Parameters<TPostComposerForm['handleSubmit']>[1]>;

// RHF owns native input focus. The contenteditable body has no native input ref.
export const focusInvalidPostContent: TInvalidHandler = (errors, event) => {
  if (errors.title || (!errors.body && !errors.editorValid)) return;
  const form = event?.target;
  if (!(form instanceof HTMLFormElement)) return;
  form.querySelector<HTMLElement>('[role="textbox"][contenteditable]')?.focus();
};
