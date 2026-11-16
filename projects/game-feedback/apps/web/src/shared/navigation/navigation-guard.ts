export interface INavigationGuard {
  confirm: () => boolean;
  /** 앱 back이 이 초안이 든 오버레이만 닫을 때 묻는다. 없으면 `confirm`으로 묻는다. */
  confirmClose?: () => boolean;
  onDiscard?: () => void;
  /** 오버레이 안에서 등록한 가드면 그 오버레이 id다. 그 오버레이를 닫을 때도 확인한다. */
  overlayId?: string | null;
}

/** 한 Provider가 등록한 초안만 소유한다. 브라우저 전체의 모듈 상태로 공유하지 않는다. */
export class NavigationGuardRegistry {
  private readonly guards = new Set<INavigationGuard>();
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.guards.size > 0;

  getServerSnapshot = () => false;

  private emit() {
    for (const listener of this.listeners) listener();
  }

  register(guard: INavigationGuard) {
    this.guards.add(guard);
    this.emit();
    return () => {
      if (this.guards.delete(guard)) this.emit();
    };
  }

  /** overlayId를 주면 그 오버레이 안의 초안만 닫기 확인으로 묻는다. 아래 화면의 초안은 화면을 떠날 때 확인한다. */
  prepare(overlayId?: string) {
    const closing = overlayId !== undefined;
    const active = [...this.guards].filter((guard) => !closing || guard.overlayId === overlayId);
    if (!active.every((guard) => (closing && guard.confirmClose ? guard.confirmClose() : guard.confirm())))
      return null;
    return () => {
      for (const guard of active) guard.onDiscard?.();
    };
  }
}

const confirmationEvent = 'game-feedback:confirm-navigation';
interface IConfirmationRequest {
  overlayId?: string;
  onApproved: (discard: () => void) => void;
}

/** hydration 전의 탐색 감시와 Provider를 연결하며, 가드 자체는 보관하지 않는다. */
export function bindNavigationGuard({ registry }: { registry: NavigationGuardRegistry }) {
  const handleConfirmation = (event: Event) => {
    if (event.defaultPrevented) return;
    const { detail } = event as CustomEvent<IConfirmationRequest>;
    try {
      const discard = registry.prepare(detail.overlayId);
      if (!discard) {
        event.preventDefault();
        return;
      }
      detail.onApproved(discard);
    } catch (error) {
      event.preventDefault();
      throw error;
    }
  };
  window.addEventListener(confirmationEvent, handleConfirmation);
  return () => window.removeEventListener(confirmationEvent, handleConfirmation);
}

function requestConfirmation(overlayId?: string) {
  const discards: Array<() => void> = [];
  const allowed = window.dispatchEvent(
    new CustomEvent<IConfirmationRequest>(confirmationEvent, {
      cancelable: true,
      detail: { overlayId, onApproved: (discard) => discards.push(discard) },
    }),
  );
  if (!allowed) return false;
  for (const discard of discards) discard();
  return true;
}

export function confirmNavigation() {
  return requestConfirmation();
}

/** 앱 back으로 오버레이를 닫기 전에 그 오버레이 안의 초안만 확인한다. 승인하면 그 초안의 onDiscard를 실행한다. */
export function confirmOverlayClose(overlayId: string) {
  return requestConfirmation(overlayId);
}
