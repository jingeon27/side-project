'use client';

import { use, useEffect, useEffectEvent } from 'react';

import { NavigationOverlayContext, useNavigationGuardRegistry } from './NavigationGuardProvider';

interface IUnsavedChangesOptions {
  hasChanges: boolean;
  /** 화면을 떠날 때 묻는다. */
  confirm: () => boolean;
  /** 앱 back이 이 초안이 든 오버레이만 닫을 때 묻는다. 없으면 confirm으로 묻는다. */
  confirmClose?: () => boolean;
  onDiscard?: () => void;
}

export function useUnsavedChanges({ hasChanges, confirm, confirmClose, onDiscard }: IUnsavedChangesOptions) {
  const registry = useNavigationGuardRegistry();
  const overlayId = use(NavigationOverlayContext);
  const handleConfirm = useEffectEvent(confirm);
  const handleConfirmClose = useEffectEvent(() => (confirmClose ?? confirm)());
  const handleDiscard = useEffectEvent(() => onDiscard?.());
  useEffect(() => {
    if (!hasChanges) return;
    return registry.register({
      confirm: handleConfirm,
      confirmClose: handleConfirmClose,
      onDiscard: handleDiscard,
      overlayId,
    });
  }, [hasChanges, registry, overlayId]);
}
