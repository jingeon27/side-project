import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { FieldValues, UseFormProps } from 'react-hook-form';
import type { z } from 'zod';

/**
 * zod 스키마로 검증하는 react-hook-form. 입력 값 타입은 스키마의 input, 제출 값은 output(trim·변환 결과)이다.
 * 스키마는 도메인의 `model/*.schema.ts`에 두고, 화면은 값을 useWatch로 구독한다.
 */
export function useZodForm<TInput extends FieldValues, TOutput extends FieldValues>(
  schema: z.ZodType<TOutput, TInput>,
  options: Omit<UseFormProps<TInput, unknown, TOutput>, 'resolver'> = {},
) {
  return useForm<TInput, unknown, TOutput>({
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    ...options,
    resolver: zodResolver(schema),
  });
}
