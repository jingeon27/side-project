interface INavigationGuard {
  confirm: () => boolean;
  onConfirm?: () => void;
}
const guards = new Set<INavigationGuard>();

export function registerNavigationGuard(confirm: () => boolean, onConfirm?: () => void) {
  const guard = { confirm, onConfirm };
  guards.add(guard);
  return () => {
    guards.delete(guard);
  };
}

export function confirmNavigation() {
  const active = [...guards];
  if (!active.every((guard) => guard.confirm())) return false;
  for (const guard of active) guard.onConfirm?.();
  return true;
}
