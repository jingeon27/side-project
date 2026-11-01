'use client';

import { useCallback, useState } from 'react';

import { useBackgroundQuery, useReadQuery, type QueryRef } from '@apollo/client/react';
import { ArrowUpRight, ChevronRight, PenLine, UsersRound } from 'lucide-react';

import { MyGroupsDocument, type MyGroupsQuery } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { useAppRouter } from '@/shared/model/router';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { BottomSheet, type IBottomSheetControlProps } from '@/shared/ui/@core/bottom-sheet';
import { Button } from '@/shared/ui/@core/button';
import { Skeleton } from '@/shared/ui/@core/skeleton';

function PostChoice({
  queryRef,
  onSelectGroup,
  onClose,
}: {
  queryRef: QueryRef<MyGroupsQuery>;
  onSelectGroup: () => void;
  onClose: () => void;
}) {
  const { data } = useReadQuery(queryRef);
  const router = useAppRouter();
  const [group] = data.myGroups;
  return (
    <Button
      variant="secondary"
      size="lg"
      className="w-full justify-start"
      onClick={() => {
        if (!group) {
          router.push(ROUTES.GROUP_CREATE);
          onClose();
          return;
        }
        if (data.myGroups.length === 1) {
          router.push(ROUTES.GROUP_WRITE(group.id));
          onClose();
          return;
        }
        onSelectGroup();
      }}
    >
      <PenLine aria-hidden className="size-5" />
      게시글 작성
      <ChevronRight aria-hidden className="ml-auto size-5 text-muted" />
    </Button>
  );
}

function PostGroups({ queryRef, onClose }: { queryRef: QueryRef<MyGroupsQuery>; onClose: () => void }) {
  const { data } = useReadQuery(queryRef);
  const router = useAppRouter();
  const firstActionRef = useCallback((button: HTMLButtonElement | null) => {
    button?.focus();
  }, []);
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

export function ComposeEntryBottomSheet({ isOpen, onClose, unmount }: IBottomSheetControlProps) {
  const [isSelectingGroup, setIsSelectingGroup] = useState(false);
  const [queryRef, { refetch }] = useBackgroundQuery(MyGroupsDocument);
  const router = useAppRouter();

  return (
    <BottomSheet.Root isOpen={isOpen} onClose={onClose} unmount={unmount}>
      <BottomSheet.Header title={isSelectingGroup ? '게시글을 올릴 그룹' : '글쓰기'} closeLabel="닫기" />
      <BottomSheet.Content>
        {isSelectingGroup ? (
          <AsyncBoundary onRetry={refetch} fallback={<Skeleton className="h-28 w-full" />}>
            <PostGroups queryRef={queryRef} onClose={onClose} />
          </AsyncBoundary>
        ) : (
          <div className="flex flex-col gap-3">
            <Button
              variant="secondary"
              size="lg"
              className="w-full justify-start"
              onClick={() => {
                router.push(ROUTES.GROUP_CREATE);
                onClose();
              }}
            >
              <UsersRound aria-hidden className="size-5" />
              그룹 만들기
              <ChevronRight aria-hidden className="ml-auto size-5 text-muted" />
            </Button>
            <AsyncBoundary
              onRetry={refetch}
              fallback={
                <Button variant="secondary" size="lg" fullWidth disabled>
                  <PenLine aria-hidden className="size-5" /> 게시글 작성
                </Button>
              }
            >
              <PostChoice
                queryRef={queryRef}
                onSelectGroup={() => setIsSelectingGroup(true)}
                onClose={onClose}
              />
            </AsyncBoundary>
          </div>
        )}
      </BottomSheet.Content>
    </BottomSheet.Root>
  );
}
