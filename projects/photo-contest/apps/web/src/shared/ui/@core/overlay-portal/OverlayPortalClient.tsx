'use client';

import type { ReactNode } from 'react';

import { getOverlayContainer } from '../../../lib/overlay-container.helper';

export interface IOverlayPortalProps {
  children: (container: HTMLElement | undefined) => ReactNode;
}

/** 컨테이너 선택과 Portal 생성 모두 SSR을 건너뛴 뒤 실행한다. */
export function OverlayPortalClient({ children }: IOverlayPortalProps) {
  return children(getOverlayContainer());
}
