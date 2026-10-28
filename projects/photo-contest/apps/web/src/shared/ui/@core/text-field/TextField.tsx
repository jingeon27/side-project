import {
  TextAreaField as SharedTextAreaField,
  TextField as SharedTextField,
  type ITextAreaFieldProps,
  type ITextFieldProps,
} from '@side/design-system';

import { FieldRequirement } from './FieldRequirement';

export type { ITextAreaFieldProps, ITextFieldProps } from '@side/design-system';

export function TextField(props: ITextFieldProps) {
  return (
    <SharedTextField
      {...props}
      labelSuffix={
        props.labelSuffix === undefined ? <FieldRequirement required={props.required} /> : props.labelSuffix
      }
    />
  );
}

export function TextArea(props: ITextAreaFieldProps) {
  return (
    <SharedTextAreaField
      {...props}
      labelSuffix={
        props.labelSuffix === undefined ? <FieldRequirement required={props.required} /> : props.labelSuffix
      }
    />
  );
}
