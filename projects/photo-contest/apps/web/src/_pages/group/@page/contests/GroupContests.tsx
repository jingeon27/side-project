'use client';

import type { TGroupQueryRef } from '../model/group-query.type';

import { useReadQuery } from '@apollo/client/react';
import { Plus } from 'lucide-react';
import { overlay } from 'overlay-kit';
import { match } from 'ts-pattern';

import { ContestListItem, CreateContestBottomSheet } from '@/features/contest';
import { isGroupOwner, splitContests } from '@/features/group';
import { Button } from '@/shared/ui/@core/button';
import { EmptyState } from '@/shared/ui/@core/empty-state';

export function GroupContests({ groupRef }: { groupRef: TGroupQueryRef }) {
  const { data } = useReadQuery(groupRef);
  if (!data) return null;
  const { group } = data;
  const { active, finished } = splitContests(group.contests);
  const handleCreateContest = () =>
    overlay.open(({ isOpen, close, unmount }) => (
      <CreateContestBottomSheet groupId={group.id} isOpen={isOpen} onClose={close} unmount={unmount} />
    ));
  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-title text-ink">진행 중인 대회</h2>
          {isGroupOwner(group.role) ? (
            <Button size="md" onClick={handleCreateContest}>
              <Plus aria-hidden className="size-4" />
              대회 만들기
            </Button>
          ) : null}
        </div>
        {match(active)
          .with([], () => (
            <EmptyState
              title="첫 대회를 기다리고 있어요"
              description="관리자가 대회를 열면 사진을 제출할 수 있어요."
            />
          ))
          .otherwise((contests) =>
            contests.map((contest) => <ContestListItem key={contest.id} contest={contest} />),
          )}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-title text-ink">지난 대회</h2>
        {match(finished)
          .with([], () => <p className="text-body text-muted">대회가 끝나면 여기에 기록해요.</p>)
          .otherwise((contests) =>
            contests.map((contest) => <ContestListItem key={contest.id} contest={contest} />),
          )}
      </section>
    </>
  );
}
