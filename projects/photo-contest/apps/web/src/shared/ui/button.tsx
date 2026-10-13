'use client';
import { Button as BaseButton } from '@base-ui/react/button';
import { clsx } from 'clsx';
export function Button({
  className,
  variant = 'primary',
  ...props
}: BaseButton.Props & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <BaseButton className={clsx('button', `button-${variant}`, className)} {...props} />;
}
