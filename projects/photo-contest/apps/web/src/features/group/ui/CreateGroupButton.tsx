'use client';

import { Plus } from 'lucide-react';
import { overlay } from 'overlay-kit';

import { Button } from '@/shared/ui/@core/button';

import { CreateGroupBottomSheet } from './CreateGroupBottomSheet';

export function CreateGroupButton() {
  return (
    <Button
      variant="accent"
      size="md"
      className="rounded-full"
      onClick={() =>
        overlay.open(({ isOpen, close: onClose, unmount }) => (
          <CreateGroupBottomSheet isOpen={isOpen} onClose={onClose} unmount={unmount} />
        ))
      }
    >
      <Plus aria-hidden className="mr-1 size-4" />
      그룹 만들기
    </Button>
  );
}
