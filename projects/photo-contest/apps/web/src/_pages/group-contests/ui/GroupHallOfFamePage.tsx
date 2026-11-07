'use client';

import { Medal } from 'lucide-react';

import { CompletedGroupContestCard } from '@/features/contest';
import { GroupContentFrame } from '@/features/group';
import { GroupContestFilter } from '@/shared/api/generated';
import { EmptyState } from '@/shared/ui/@core/empty-state';
import { NotificationBell } from '@/widgets/notification-bell';

import { GroupContestList } from './list/GroupContestList';

/** 종료된 그룹 대회의 우승작과 결과 모음 */
export function GroupHallOfFamePage({ groupId }: { groupId: string }) {
  return (
    <GroupContentFrame groupId={groupId} headerActions={<NotificationBell />} title="지난 대회 명예의 전당">
      <section className="flex flex-col gap-5" aria-label="지난 대회 명예의 전당">
        <div>
          <h2 className="text-title-lg text-ink">함께 웃었던 순간들</h2>
          <p className="mt-2 text-body text-muted">종료된 대회의 우승작과 결과를 모았어요.</p>
        </div>
        <GroupContestList
          groupId={groupId}
          filter={GroupContestFilter.Completed}
          empty={
            <EmptyState
              icon={<Medal />}
              title="아직 지난 대회가 없어요"
              description="대회가 끝나면 우승작과 결과를 여기서 다시 볼 수 있어요."
            />
          }
          renderContest={(id) => <CompletedGroupContestCard id={id} />}
        />
      </section>
    </GroupContentFrame>
  );
}
