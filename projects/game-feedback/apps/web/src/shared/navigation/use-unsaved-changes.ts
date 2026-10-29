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
    return registry.register({
      confirm: handleConfirm,
      onDiscard: handleDiscard,
    });
  }, [hasChanges, registry]);
}
