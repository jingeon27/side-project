type TScrollViewport = Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'>;

export class ChatScrollController {
  private initialized = false;
  private nearBottom = true;
  private forceBottom = false;
  private newestId = '';
  private historyAnchor: { height: number; top: number } | null = null;
  private unseen = false;
  private readonly listeners = new Set<() => void>();

  getSnapshot = () => this.unseen;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private setUnseen(value: boolean) {
    if (this.unseen === value) return;
    this.unseen = value;
    this.listeners.forEach((listener) => listener());
  }

  reconcile(element: TScrollViewport, newestId: string, fetchingOlder: boolean) {
    if (this.historyAnchor) {
      if (!fetchingOlder) {
        element.scrollTop = element.scrollHeight - this.historyAnchor.height + this.historyAnchor.top;
        this.historyAnchor = null;
      }
      return;
    }
    const follow = !this.initialized || this.forceBottom || this.nearBottom;
    const newMessage = newestId !== this.newestId;
    this.newestId = newestId;
    if (follow) {
      this.scrollLatest(element);
      this.initialized = true;
      this.forceBottom = false;
      return;
    }
    if (newMessage) this.setUnseen(true);
  }

  scroll(element: TScrollViewport) {
    this.nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 90;
    if (this.nearBottom) this.setUnseen(false);
  }

  scrollLatest(element: TScrollViewport) {
    this.historyAnchor = null;
    this.forceBottom = false;
    element.scrollTop = element.scrollHeight;
    this.nearBottom = true;
    this.setUnseen(false);
  }

  sent() {
    this.historyAnchor = null;
    this.nearBottom = true;
    this.forceBottom = true;
    this.setUnseen(false);
  }

  resize(element: TScrollViewport) {
    if (!this.initialized || this.historyAnchor) return;
    if (this.nearBottom || this.forceBottom) this.scrollLatest(element);
  }

  captureHistory(element: TScrollViewport) {
    this.historyAnchor = { height: element.scrollHeight, top: element.scrollTop };
  }
}
