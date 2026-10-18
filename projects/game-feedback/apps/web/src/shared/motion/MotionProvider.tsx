'use client';

import type { ReactNode } from 'react';
import { domAnimation, LazyMotion, MotionConfig } from 'framer-motion';
import { interactionTransition } from './transitions';
import { useMotionPreference } from './use-motion-preference';

export function MotionProvider({ children }: { children: ReactNode }) {
  const reducedMotion = useMotionPreference();
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={reducedMotion ? { duration: 0 } : interactionTransition}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
