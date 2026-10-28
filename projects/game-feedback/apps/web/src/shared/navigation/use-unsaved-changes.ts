'use client';

import { useEffect, useEffectEvent } from 'react';

import { registerNavigationGuard } from './navigation-guard';

export function useUnsavedChanges(hasChanges: boolean, message: string, onDiscard?: () => void) {
  const handleDiscard = useEffectEvent(() => onDiscard?.());
  useEffect(() => {
    if (!hasChanges) return;
    const release = registerNavigationGuard(
      () => window.confirm(message),
      () => handleDiscard(),
    );
    const handleUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      release();
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [hasChanges, message]);
}
