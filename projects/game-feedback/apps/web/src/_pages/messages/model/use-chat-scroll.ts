import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface IChatScrollOptions {
  messageStamp: string;
  newestId: string;
  pending: boolean;
  unavailable: boolean;
  fetchingOlder: boolean;
}

interface IHistoryAnchor {
  height: number;
  top: number;
}

export function useChatScroll({
  messageStamp,
  newestId,
  pending,
  unavailable,
  fetchingOlder,
}: IChatScrollOptions) {
  const scroller = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const nearBottom = useRef(true);
  const forceBottom = useRef(false);
  const lastNewest = useRef('');
  const historyAnchor = useRef<IHistoryAnchor | null>(null);
  const [unseen, setUnseen] = useState(false);
  const [visibleBoundary, setVisibleBoundary] = useState('');

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || pending || unavailable) return;
    if (historyAnchor.current) {
      if (!fetchingOlder) {
        element.scrollTop = element.scrollHeight - historyAnchor.current.height + historyAnchor.current.top;
        historyAnchor.current = null;
      }
      return;
    }
    const shouldFollow = !initialized.current || forceBottom.current || nearBottom.current;
    if (shouldFollow) {
      element.scrollTop = element.scrollHeight;
      initialized.current = true;
      forceBottom.current = false;
      setUnseen(false);
    }
    if (!shouldFollow && newestId !== lastNewest.current) setUnseen(true);
    lastNewest.current = newestId;
  }, [messageStamp, newestId, pending, unavailable, fetchingOlder]);

  useEffect(() => {
    const element = scroller.current;
    if (!element || unavailable) return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const node = entry.target as HTMLElement;
          const messageId = node.dataset.messageId;
          if (!messageId) continue;
          if (entry.isIntersecting) {
            visible.set(messageId, Number(node.dataset.messageIndex));
            continue;
          }
          visible.delete(messageId);
        }
        const boundary = [...visible.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (boundary) setVisibleBoundary(boundary);
      },
      { root: element, threshold: 0.1 },
    );
    for (const node of element.querySelectorAll('[data-message-id]')) observer.observe(node);
    return () => observer.disconnect();
  }, [messageStamp, unavailable]);

  function handleScroll() {
    const element = scroller.current;
    if (!element) return;
    nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 90;
    if (nearBottom.current) setUnseen(false);
  }

  function handleScrollLatest() {
    const element = scroller.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    nearBottom.current = true;
    setUnseen(false);
  }

  function handleSent() {
    forceBottom.current = true;
    handleScrollLatest();
  }

  function handleCaptureHistory() {
    const element = scroller.current;
    if (!element) return;
    historyAnchor.current = { height: element.scrollHeight, top: element.scrollTop };
  }

  return {
    scroller,
    unseen,
    visibleBoundary,
    handleScroll,
    handleScrollLatest,
    handleSent,
    handleCaptureHistory,
  };
}
