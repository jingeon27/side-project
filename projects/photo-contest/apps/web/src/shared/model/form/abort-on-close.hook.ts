import { useCallback, useEffect, useRef } from 'react';

import { toast } from '../toast';

/**
 * 시트가 닫히면(닫기·뒤로 가기·스와이프·Esc) 진행 중인 제출을 멈춘다. 제출마다 돌려준 함수로 신호를 받아
 * 업로드에 넘기고, 되돌릴 수 없는 다음 단계 직전에 `throwIfClosed`로 확인한다.
 * 닫힌 시트는 unmount되지만 시작한 Promise는 남아 mutation을 끝까지 보내기 때문이다.
 */
export function useAbortOnClose(isOpen: boolean) {
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!isOpen) controllerRef.current?.abort();
  }, [isOpen]);
  useEffect(() => () => controllerRef.current?.abort(), []);
  return useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    return controller.signal;
  }, []);
}

/** 시트가 닫혔으면 다음 단계(업로드 요청·게시)를 시작하지 않고 catch로 보낸다. */
export function throwIfClosed(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('시트를 닫아 제출을 멈췄습니다.', 'AbortError');
}

/** 닫힌 시트의 입력 칸 오류는 보이지 않으므로, 제출이 끝나지 않았다는 사실을 토스트로 알린다. */
export function notifyClosedSubmit(title: string) {
  toast.info(title, { description: '올리는 중에 창을 닫아서 멈췄어요. 다시 올려 주세요.' });
}
