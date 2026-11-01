'use client';

import type { ReactNode } from 'react';

import { domAnimation, LazyMotion, MotionConfig, type Transition } from 'motion/react';

import { useMotionPreference } from '../../lib/use-motion-preference';

const interactionTransition = {
  duration: 0.2,
  ease: [0.22, 1, 0.36, 1],
} satisfies Transition;

export interface IMotionProviderProps {
  children: ReactNode;
}

/** DOM을 추가하지 않고 같은 Motion 인스턴스의 LazyMotion 구성·전환·모션 감소 정책을 제공한다. */
export function MotionProvider({ children }: IMotionProviderProps) {
  const reducedMotion = useMotionPreference();
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={reducedMotion ? { duration: 0 } : interactionTransition}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
