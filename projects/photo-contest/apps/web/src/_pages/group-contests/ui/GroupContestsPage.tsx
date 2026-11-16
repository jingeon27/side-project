'use client';

import { Trophy } from 'lucide-react';

import { GroupContestCard } from '@/features/contest';
import { GroupContentFrame } from '@/features/group';
import { GroupContestFilter } from '@/shared/api/generated';
import { EmptyState } from '@/shared/ui/@core/empty-state';
import { NotificationBell } from '@/widgets/notification-bell';

import { CreateGroupContestButton } from './create/CreateGroupContestButton';
import { GroupContestList } from './list/GroupContestList';

/** 접수·투표 중인 그룹 대회와 대회 개최 진입 */
export function GroupContestsPage({ groupId }: { groupId: string }) {
  return (
    <GroupContentFrame
      groupId={groupId}
      headerActions={<NotificationBell />}
      title="그룹 대회"
      actions={<CreateGroupContestButton groupId={groupId} />}
    >
      <section className="flex flex-col gap-5" aria-label="진행 중인 그룹 대회">
        <div>
          <h2 className="text-title-lg text-ink">이번 대회의 주인공은?</h2>
          <p className="mt-2 text-body text-muted">접수 중인 대회를 골라 사진이나 동영상을 올려보세요.</p>
        </div>
        <GroupContestList
          groupId={groupId}
          filter={GroupContestFilter.Active}
          empty={
            <EmptyState
              icon={<Trophy />}
              title="아직 진행 중인 대회가 없어요"
              description="관리자와 부관리자가 대회를 개최할 수 있어요."
            />
          }
          renderContest={(id) => <GroupContestCard id={id} />}
        />
      </section>
    </GroupContentFrame>
  );
}
