import { useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';

import { ChatScrollController } from './chat-scroll-controller';

interface IChatScrollOptions {
  messageStamp: string;
  newestId: string;
  pending: boolean;
  unavailable: boolean;
  fetchingOlder: boolean;
}

export function useChatScroll({
  messageStamp,
  newestId,
  pending,
  unavailable,
  fetchingOlder,
}: IChatScrollOptions) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [controller] = useState(() => new ChatScrollController());
  const unseen = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [visibleBoundary, setVisibleBoundary] = useState('');

  useLayoutEffect(() => {
    if (!element || pending || unavailable) return;
    controller.reconcile(element, newestId, fetchingOlder);
  }, [controller, element, messageStamp, newestId, pending, unavailable, fetchingOlder]);

  const handleScroller = useCallback(
    (node: HTMLDivElement | null) => {
      setElement(node);
      if (!node || unavailable) return;
      const handleResize = () => controller.resize(node);
      const observer = new ResizeObserver(handleResize);
      observer.observe(node);
      const content = node.firstElementChild;
      if (content) observer.observe(content);
      return () => observer.disconnect();
    },
    [controller, unavailable],
  );

  useEffect(() => {
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
  }, [element, messageStamp, unavailable]);

  const handleScroll = useCallback(() => {
    if (element) controller.scroll(element);
  }, [controller, element]);

  const handleScrollLatest = useCallback(() => {
    if (!element) return;
    controller.scrollLatest(element);
  }, [controller, element]);

  const handleSent = useCallback(() => {
    controller.sent();
    handleScrollLatest();
  }, [controller, handleScrollLatest]);

  const handleCaptureHistory = useCallback(() => {
    if (element) controller.captureHistory(element);
  }, [controller, element]);

  return {
    scroller: handleScroller,
    unseen,
    visibleBoundary,
    handleScroll,
    handleScrollLatest,
    handleSent,
    handleCaptureHistory,
  };
}
