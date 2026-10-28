export interface INavigationGuard {
  confirm: () => boolean;
  onDiscard?: () => void;
}

/** 한 Provider가 등록한 초안만 소유한다. 브라우저 전체의 모듈 상태로 공유하지 않는다. */
export class NavigationGuardRegistry {
  readonly #guards = new Set<INavigationGuard>();
  readonly #listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  getSnapshot = () => this.#guards.size > 0;

  getServerSnapshot = () => false;

  #emit() {
    for (const listener of this.#listeners) listener();
  }

  register(guard: INavigationGuard) {
    this.#guards.add(guard);
    this.#emit();
    return () => {
      if (this.#guards.delete(guard)) this.#emit();
    };
  }

  prepare() {
    const active = [...this.#guards];
    if (!active.every((guard) => guard.confirm())) return null;
    return () => {
      for (const guard of active) guard.onDiscard?.();
    };
  }
}

const confirmationEvent = 'game-feedback:confirm-navigation';
interface IConfirmationRequest {
  onApproved: (discard: () => void) => void;
}

/** hydration 전의 탐색 감시와 Provider를 연결하며, 가드 자체는 보관하지 않는다. */
export function bindNavigationGuard({ registry }: { registry: NavigationGuardRegistry }) {
  function handleConfirmation(event: Event) {
    if (event.defaultPrevented) return;
    try {
      const discard = registry.prepare();
      if (!discard) {
        event.preventDefault();
        return;
      }
      (event as CustomEvent<IConfirmationRequest>).detail.onApproved(discard);
    } catch (error) {
      event.preventDefault();
      throw error;
    }
  }
  window.addEventListener(confirmationEvent, handleConfirmation);
  return () => window.removeEventListener(confirmationEvent, handleConfirmation);
}

export function confirmNavigation() {
  const discards: Array<() => void> = [];
  const allowed = window.dispatchEvent(
    new CustomEvent<IConfirmationRequest>(confirmationEvent, {
      cancelable: true,
      detail: { onApproved: (discard) => discards.push(discard) },
    }),
  );
  if (!allowed) return false;
  for (const discard of discards) discard();
  return true;
}
