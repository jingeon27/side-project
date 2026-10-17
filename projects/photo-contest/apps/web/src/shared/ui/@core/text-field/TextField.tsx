import {
  TextField as SharedTextField,
  TextArea as SharedTextArea,
  type ITextFieldProps,
  type ITextAreaProps,
} from '@side/design-system';
import { FieldRequirement } from './FieldRequirement';

export type { ITextAreaProps, ITextFieldProps } from '@side/design-system';

export function TextField(props: ITextFieldProps) {
  return <SharedTextField {...props} labelSuffix={<FieldRequirement required={props.required} />} />;
}

export function TextArea(props: ITextAreaProps) {
  return <SharedTextArea {...props} labelSuffix={<FieldRequirement required={props.required} />} />;
}
