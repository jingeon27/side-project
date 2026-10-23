'use client';

import { useEffect } from 'react';

import { installInteractionTracking } from './interaction-tracking';

export function InteractionTracker() {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY?.trim()) return;
    return installInteractionTracking();
  }, []);
  return null;
}
