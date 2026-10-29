'use client';

import { Plus } from 'lucide-react';

import { ROUTES } from '@/shared/constants/routes';
import { useAppRouter } from '@/shared/model/router';
import { Button } from '@/shared/ui/@core/button';

export function CreateGroupButton() {
  const router = useAppRouter();
  return (
    <Button
      variant="accent"
      size="md"
      className="rounded-full"
      onClick={() => router.push(ROUTES.GROUP_CREATE)}
    >
      <Plus aria-hidden className="mr-1 size-4" />
      그룹 만들기
    </Button>
  );
}
