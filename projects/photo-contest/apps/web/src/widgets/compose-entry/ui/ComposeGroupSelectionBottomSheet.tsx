'use client';

import { useCallback, useRef, type ComponentProps, type RefCallback } from 'react';

import { useBackgroundQuery, useReadQuery, type QueryRef } from '@apollo/client/react';
import { ArrowUpRight } from 'lucide-react';

import { MyGroupsDocument, type MyGroupsQuery } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { useAppRouter } from '@/shared/model/router';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { BottomSheet, type IBottomSheetControlProps } from '@/shared/ui/@core/bottom-sheet';
import { Button } from '@/shared/ui/@core/button';
import { Skeleton } from '@/shared/ui/@core/skeleton';

function GroupChoices({
  queryRef,
  onClose,
  onNavigate,
  firstActionRef,
}: {
  queryRef: QueryRef<MyGroupsQuery>;
  onClose: () => void;
  onNavigate: () => void;
  firstActionRef: RefCallback<HTMLButtonElement>;
}) {
  const { data } = useReadQuery(queryRef);
  const router = useAppRouter();
  if (!data.myGroups.length)
    return (
      <div className="flex flex-col gap-4">
        <p className="text-body text-muted">게시물을 올릴 그룹을 먼저 만들어 주세요.</p>
        <Button
          ref={firstActionRef}
          variant="accent"
          size="lg"
          fullWidth
          onClick={() => {
            router.push(ROUTES.GROUP_CREATE);
            onClose();
            onNavigate();
          }}
        >
          그룹 만들기 <ArrowUpRight aria-hidden className="size-4" />
        </Button>
      </div>
    );

  return (
    <ul className="flex flex-col gap-2">
      {data.myGroups.map((group, index) => (
        <li key={group.id}>
          <Button
            ref={index === 0 ? firstActionRef : undefined}
            variant="secondary"
            size="lg"
            className="w-full justify-start"
            onClick={() => {
              router.push(ROUTES.GROUP_WRITE(group.id));
              onClose();
              onNavigate();
            }}
          >
            <span className="min-w-0 truncate">{group.name}</span>
            <ArrowUpRight aria-hidden className="ml-auto size-4" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

interface IComposeGroupSelectionBottomSheetProps
  extends IBottomSheetControlProps, Pick<ComponentProps<typeof BottomSheet.Root>, 'finalFocus'> {
  /** 작성 화면으로 이동할 때 이 선택 시트를 연 작성 행동 시트도 닫는다. */
  onNavigate: () => void;
}

export function ComposeGroupSelectionBottomSheet({
  isOpen,
  onClose,
  unmount,
  onNavigate,
  finalFocus,
}: IComposeGroupSelectionBottomSheetProps) {
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const handleFirstActionRef = useCallback((button: HTMLButtonElement | null) => {
    firstActionRef.current = button;
    if (!button) return;
    return () => {
      firstActionRef.current = null;
    };
  }, []);
  const [queryRef, { refetch }] = useBackgroundQuery(MyGroupsDocument);
  return (
    <BottomSheet.Root
      isOpen={isOpen}
      onClose={onClose}
      unmount={unmount}
      initialFocus={firstActionRef}
      finalFocus={finalFocus}
    >
      <BottomSheet.Header title="게시글을 올릴 그룹" closeLabel="닫기" />
      <BottomSheet.Content>
        <AsyncBoundary onRetry={refetch} fallback={<Skeleton className="h-28 w-full" />}>
          <GroupChoices
            queryRef={queryRef}
            onClose={onClose}
            onNavigate={onNavigate}
            firstActionRef={handleFirstActionRef}
          />
        </AsyncBoundary>
      </BottomSheet.Content>
    </BottomSheet.Root>
  );
}
