import type { ComponentProps } from 'react';

import { FormField, type IFormFieldProps } from '../form-field/FormField';
import { Input } from '../input/Input';
import { Textarea } from '../textarea/Textarea';

type TFieldTextProps = Omit<IFormFieldProps, 'children'>;

export interface ITextFieldProps extends TFieldTextProps, Omit<ComponentProps<'input'>, 'className'> {}

/** FormField + Input 한 줄 입력. `{...register('name')}`을 그대로 넘기며 className은 필드 전체에 붙는다. */
export function TextField({
  label,
  description,
  error,
  labelSuffix,
  className,
  ...inputProps
}: ITextFieldProps) {
  return (
    <FormField
      label={label}
      description={description}
      error={error}
      labelSuffix={labelSuffix}
      className={className}
    >
      <Input {...inputProps} />
    </FormField>
  );
}

export interface ITextAreaFieldProps extends TFieldTextProps, Omit<ComponentProps<'textarea'>, 'className'> {}

/** FormField + Textarea 여러 줄 입력. 내용에 따라 늘지 않고 `rows`(기본 4줄) 높이를 유지한다. */
export function TextAreaField({
  label,
  description,
  error,
  labelSuffix,
  className,
  rows = 4,
  ...textareaProps
}: ITextAreaFieldProps) {
  return (
    <FormField
      label={label}
      description={description}
      error={error}
      labelSuffix={labelSuffix}
      className={className}
    >
      <Textarea {...textareaProps} rows={rows} className="field-sizing-fixed resize-none" />
    </FormField>
  );
}
