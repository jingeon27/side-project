'use client';

import { useEffect } from 'react';

import { registerNavigationGuard } from './navigation-guard';

export function useUnsavedChanges(hasChanges: boolean, message: string) {
  useEffect(() => {
    if (!hasChanges) return;
    const release = registerNavigationGuard(() => window.confirm(message));
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
