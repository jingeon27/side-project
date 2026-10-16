'use client';

import { Plus } from 'lucide-react';
import { overlay } from 'overlay-kit';

import { Button } from '@/shared/ui/@core/button';

import { CreatePostBottomSheet } from './CreatePostBottomSheet';

export function CreatePostButton({ groupId }: { groupId: string }) {
  return (
    <Button
      onClick={() =>
        overlay.open(({ isOpen, close, unmount }) => (
          <CreatePostBottomSheet groupId={groupId} isOpen={isOpen} onClose={close} unmount={unmount} />
        ))
      }
    >
      <Plus aria-hidden className="size-4" />
      글쓰기
    </Button>
  );
}
