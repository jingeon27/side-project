'use client';

import { useCallback, useEffect, useRef } from 'react';

import { useBackgroundQuery, useReadQuery, type QueryRef } from '@apollo/client/react';
import { ChevronRight, PenLine, UsersRound } from 'lucide-react';
import { overlay, useCurrentOverlay } from 'overlay-kit';

import { MyGroupsDocument, type MyGroupsQuery } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { useAppRouter } from '@/shared/model/router';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { BottomSheet, type IBottomSheetControlProps } from '@/shared/ui/@core/bottom-sheet';
import { Button } from '@/shared/ui/@core/button';

import { ComposeGroupSelectionBottomSheet } from './ComposeGroupSelectionBottomSheet';

function PostChoice({ queryRef, onClose }: { queryRef: QueryRef<MyGroupsQuery>; onClose: () => void }) {
  const { data } = useReadQuery(queryRef);
  const router = useAppRouter();
  const currentOverlay = useCurrentOverlay();
  const openerRef = useRef<HTMLButtonElement>(null);
  const handleOpenerRef = useCallback((button: HTMLButtonElement | null) => {
    openerRef.current = button;
    if (!button) return;
    return () => {
      openerRef.current = null;
    };
  }, []);
  const [group] = data.myGroups;
  const writePath = group && data.myGroups.length === 1 ? ROUTES.GROUP_WRITE(group.id) : null;
  useEffect(() => {
    if (writePath) router.prefetch(writePath);
  }, [router, writePath]);
  return (
    <Button
      ref={handleOpenerRef}
      variant="secondary"
      size="lg"
      className="w-full justify-start"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !currentOverlay) return;
        // 다음 시트의 초기 포커스 전에도 Escape는 최상위 오버레이만 닫는다.
        event.preventDefault();
        event.stopPropagation();
        overlay.close(currentOverlay);
      }}
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
        overlay.open(({ isOpen, close, unmount }) => (
          <ComposeGroupSelectionBottomSheet
            isOpen={isOpen}
            onClose={close}
            unmount={unmount}
            finalFocus={openerRef}
            onNavigate={onClose}
          />
        ));
      }}
    >
      <PenLine aria-hidden className="size-5" />
      게시글 작성
      <ChevronRight aria-hidden className="ml-auto size-5 text-muted" />
    </Button>
  );
}

export function ComposeEntryBottomSheet({ isOpen, onClose, unmount }: IBottomSheetControlProps) {
  const [queryRef, { refetch }] = useBackgroundQuery(MyGroupsDocument);
  const router = useAppRouter();
  useEffect(() => {
    router.prefetch(ROUTES.GROUP_CREATE);
  }, [router]);

  return (
    <BottomSheet.Root isOpen={isOpen} onClose={onClose} unmount={unmount}>
      <BottomSheet.Header title="글쓰기" closeLabel="닫기" />
      <BottomSheet.Content>
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
            <PostChoice queryRef={queryRef} onClose={onClose} />
          </AsyncBoundary>
        </div>
      </BottomSheet.Content>
    </BottomSheet.Root>
  );
}
