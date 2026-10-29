'use client';

import { createContext, useContext, type AriaAttributes } from 'react';

export interface IFormFieldContext {
  labelId: string;
  descriptionId?: string;
  errorId?: string;
  invalid: boolean;
}

export const FormFieldContext = createContext<IFormFieldContext | null>(null);

type TControlAria = Pick<
  AriaAttributes,
  'aria-label' | 'aria-labelledby' | 'aria-describedby' | 'aria-invalid'
>;

/** 레이블·도움말·오류 연결. 소비자가 넘긴 `aria-labelledby`·`aria-label`은 덮어쓰지 않고 설명은 뒤에 덧붙인다. */
export function getFieldAria(field: IFormFieldContext, props: TControlAria): TControlAria {
  const describedBy = [props['aria-describedby'], field.descriptionId, field.errorId]
    .filter(Boolean)
    .join(' ');
  return {
    'aria-labelledby': props['aria-labelledby'] ?? (props['aria-label'] ? undefined : field.labelId),
    'aria-describedby': describedBy || undefined,
    'aria-invalid': field.invalid ? true : props['aria-invalid'],
  };
}

/**
 * FormField 안이면 연결 속성을, 밖이면 빈 객체를 돌려준다. props 뒤에 펼친다.
 * 자식 타입을 비교하지 않으므로 memo·래퍼·서버 컴포넌트를 거쳐도 연결된다.
 */
export function useFormFieldAria(props: TControlAria): TControlAria {
  const field = useContext(FormFieldContext);
  return field ? getFieldAria(field, props) : {};
}
