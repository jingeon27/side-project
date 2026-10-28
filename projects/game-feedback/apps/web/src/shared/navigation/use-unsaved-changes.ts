'use client';

import { useEffect, useEffectEvent } from 'react';

import { useNavigationGuardRegistry } from './NavigationGuardProvider';

interface IUnsavedChangesOptions {
  hasChanges: boolean;
  confirm: () => boolean;
  onDiscard?: () => void;
}

export function useUnsavedChanges({ hasChanges, confirm, onDiscard }: IUnsavedChangesOptions) {
  const registry = useNavigationGuardRegistry();
  const handleConfirm = useEffectEvent(confirm);
  const handleDiscard = useEffectEvent(() => onDiscard?.());
  useEffect(() => {
    if (!hasChanges) return;
    const release = registry.register({
      confirm: () => handleConfirm(),
      onDiscard: () => handleDiscard(),
    });
    const handleUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      release();
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [hasChanges, registry]);
}
