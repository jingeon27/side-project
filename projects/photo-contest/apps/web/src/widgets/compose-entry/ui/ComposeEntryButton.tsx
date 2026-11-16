'use client';

import { useEffect } from 'react';

import { overlay } from 'overlay-kit';

import { ROUTES } from '@/shared/constants/routes';
import { useAppRouter } from '@/shared/model/router';

import { ComposeEntryBottomSheet } from './ComposeEntryBottomSheet';
import { FloatingComposeButton } from './FloatingComposeButton';

export function ComposeEntryButton({ hasGroups }: { hasGroups: boolean }) {
  const router = useAppRouter();
  const label = hasGroups ? '글쓰기' : '그룹 만들기';
  useEffect(() => {
    if (!hasGroups) router.prefetch(ROUTES.GROUP_CREATE);
  }, [hasGroups, router]);

  return (
    <FloatingComposeButton
      label={label}
      aria-haspopup={hasGroups ? 'dialog' : undefined}
      aboveBottomNav
      onClick={() => {
        if (!hasGroups) {
          router.push(ROUTES.GROUP_CREATE);
          return;
        }
        overlay.open(({ isOpen, close, unmount }) => (
          <ComposeEntryBottomSheet isOpen={isOpen} onClose={close} unmount={unmount} />
        ));
      }}
    />
  );
}
