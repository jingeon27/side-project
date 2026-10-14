'use client';

import { useQuery } from '@apollo/client/react';
import { Plus } from 'lucide-react';
import { overlay } from 'overlay-kit';

import { LoginPanel } from '@/features/auth';
import { ContestListItem, CreateContestBottomSheet } from '@/features/contest';
import { MemberList, isGroupOwner, splitContests } from '@/features/group';
import { InviteCard } from '@/features/invite';
import { GroupLeaderboard } from '@/features/ranking';
import { GroupDocument, MeDocument } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { ERROR_CODE, getErrorCode, getErrorMessage } from '@/shared/model/error';
import { Button } from '@/shared/ui/@core/button';
import { EmptyState } from '@/shared/ui/@core/empty-state';
import { ErrorState } from '@/shared/ui/@core/error-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';

export function GroupPageTemplate({ id }: { id: string }) {
  const me = useQuery(MeDocument);
  const query = useQuery(GroupDocument, { variables: { id }, errorPolicy: 'all' });
  const group = query.data?.group;
  if (getErrorCode(query.error) === ERROR_CODE.Unauthenticated || me.data?.me === null)
    return (
      <div className="flex flex-1 flex-col">
        <TopAppBar title="그룹" backHref={ROUTES.HOME} />
        <div className="p-4">
          <LoginPanel nextPath={ROUTES.GROUP(id)} />
        </div>
      </div>
    );
  if (!group)
    return (
      <div className="flex flex-1 flex-col">
        <TopAppBar title="그룹" backHref={ROUTES.HOME} />
        {query.error ? (
          <ErrorState
            message={getErrorMessage(query.error)}
            onRetry={() => {
              query.refetch().catch(() => undefined);
            }}
          />
        ) : (
          <Skeleton className="m-4 h-48" />
        )}
      </div>
    );
  const { active: live, finished: completed } = splitContests(group.contests);
  const handleCreateContest = () =>
    overlay.open(({ isOpen, close, unmount }) => (
      <CreateContestBottomSheet groupId={id} isOpen={isOpen} onClose={close} unmount={unmount} />
    ));
  return (
    <div className="flex flex-1 flex-col">
      <TopAppBar title={group.name} backHref={ROUTES.HOME} />
      <div className="flex flex-col gap-8 p-4">
        <InviteCard
          groupId={id}
          groupName={group.name}
          inviteToken={group.inviteToken}
          canRegenerate={isGroupOwner(group.role)}
        />
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
          {live.length ? (
            live.map((contest) => <ContestListItem key={contest.id} contest={contest} />)
          ) : (
            <EmptyState
              title="첫 대회를 기다리고 있어요"
              description="관리자가 대회를 열면 사진을 제출할 수 있어요."
            />
          )}
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-title text-ink">지난 대회</h2>
          {completed.length ? (
            completed.map((contest) => <ContestListItem key={contest.id} contest={contest} />)
          ) : (
            <p className="text-body text-muted">대회가 끝나면 여기에 기록해요.</p>
          )}
        </section>
        <GroupLeaderboard groupId={id} viewerId={me.data?.me?.id} />
        <section>
          <h2 className="mb-3 text-title text-ink">함께하는 친구 {group.members.length}명</h2>
          <MemberList members={group.members} viewerId={me.data?.me?.id} />
        </section>
      </div>
    </div>
  );
}
