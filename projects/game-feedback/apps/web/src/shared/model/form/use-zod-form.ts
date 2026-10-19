import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormProps } from 'react-hook-form';
import type { z, ZodObject, ZodRawShape } from 'zod';

export function useZodForm<T extends ZodRawShape>(
  schema: ZodObject<T>,
  options?: Omit<UseFormProps<z.input<ZodObject<T>>, unknown, z.output<ZodObject<T>>>, 'resolver'>,
) {
  return useForm<z.input<ZodObject<T>>, unknown, z.output<ZodObject<T>>>({
    ...options,
    resolver: zodResolver(schema),
  });
}
