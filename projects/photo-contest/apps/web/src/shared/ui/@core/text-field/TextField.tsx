import {
  TextAreaField as SharedTextAreaField,
  TextField as SharedTextField,
  type ITextAreaFieldProps,
  type ITextFieldProps,
} from '@side/design-system';

import { FieldRequirement } from './FieldRequirement';

export type { ITextAreaFieldProps, ITextFieldProps } from '@side/design-system';

export function TextField(props: ITextFieldProps) {
  return <SharedTextField {...props} labelSuffix={<FieldRequirement required={props.required} />} />;
}

export function TextArea(props: ITextAreaFieldProps) {
  return <SharedTextAreaField {...props} labelSuffix={<FieldRequirement required={props.required} />} />;
}
