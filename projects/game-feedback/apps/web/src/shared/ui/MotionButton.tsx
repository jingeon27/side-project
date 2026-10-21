'use client';

import { Button, type IButtonProps } from '@side/design-system';

import { m, useMotionPreference } from '@/shared/motion';

export function MotionButton(props: Omit<IButtonProps, 'render'>) {
  const reducedMotion = useMotionPreference();
  const interactive = !reducedMotion && !props.disabled && !props.loading;
  return (
    <Button
      {...props}
      render={
        <m.button
          initial={false}
          whileHover={interactive ? { y: -1 } : undefined}
          whileTap={interactive ? { y: 1 } : undefined}
        />
      }
    />
  );
}
