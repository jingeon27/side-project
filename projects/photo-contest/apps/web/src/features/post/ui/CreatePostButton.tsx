'use client';

import { Plus } from 'lucide-react';
import { overlay } from 'overlay-kit';

import { Button } from '@/shared/ui/@core/button';

import { CreatePostBottomSheet } from './CreatePostBottomSheet';

export function CreatePostButton({ groupId, contestId }: { groupId: string; contestId?: string }) {
  return (
    <Button
      onClick={() =>
        overlay.open(({ isOpen, close: onClose, unmount }) => (
          <CreatePostBottomSheet
            groupId={groupId}
            defaultContestId={contestId}
            isOpen={isOpen}
            onClose={onClose}
            unmount={unmount}
          />
        ))
      }
    >
      <Plus aria-hidden className="size-4" />
      글쓰기
    </Button>
  );
}
