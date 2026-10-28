'use client';

import type { ReactNode } from 'react';

import { Menu } from '@base-ui/react/menu';

import { getOverlayContainer } from '@/shared/lib/overlay-container.helper';

export function PostActionsPortal({ children }: { children: ReactNode }) {
  return <Menu.Portal container={getOverlayContainer()}>{children}</Menu.Portal>;
}
