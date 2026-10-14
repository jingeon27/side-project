'use client';

import { skipToken, useQuery } from '@apollo/client/react';
import { Plus, Users } from 'lucide-react';
import { overlay } from 'overlay-kit';

import { LoginPanel } from '@/features/auth';
import { PhaseBadge } from '@/features/contest';
import { CreateGroupBottomSheet, GroupCard } from '@/features/group';
import { MeDocument, MyGroupsDocument } from '@/shared/api/generated';
import { getErrorMessage } from '@/shared/model/error';
import { Button } from '@/shared/ui/@core/button';
import { EmptyState } from '@/shared/ui/@core/empty-state';
import { ErrorState } from '@/shared/ui/@core/error-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { BrandAppBar } from '@/shared/ui/@core/top-app-bar';
import { BottomNav } from '@/widgets/bottom-nav';

function handleCreateGroup() {
  overlay.open(({ isOpen, close, unmount }) => (
    <CreateGroupBottomSheet isOpen={isOpen} onClose={close} unmount={unmount} />
  ));
}

export function HomePageTemplate() {
  const me = useQuery(MeDocument);
  const groups = useQuery(MyGroupsDocument, me.data?.me ? {} : skipToken);
  return (
    <div className="flex flex-1 flex-col">
      <BrandAppBar />
      <div className="flex flex-1 flex-col gap-6 px-4 py-6">
        <section className="rounded-card bg-brand-soft p-5">
          <p className="text-micro text-brand">우리끼리 사진 대회</p>
          <h2 className="mt-2 text-title-lg text-ink">친구끼리 웃긴 순간을 모아요</h2>
          <p className="mt-2 text-body text-muted">
            한 사람 한 장, 한 사람 한 표. 우리만의 최고의 순간을 뽑아보세요.
          </p>
        </section>
        {me.error ? (
          <ErrorState
            message={getErrorMessage(me.error)}
            onRetry={() => {
              me.refetch().catch(() => undefined);
            }}
          />
        ) : !me.data ? (
          <Skeleton className="h-32 w-full" />
        ) : !me.data.me ? (
          <LoginPanel />
        ) : (
          <section className="flex flex-col gap-4">
            <p className="text-caption text-muted">{me.data.me.nickname}님의 그룹</p>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-title text-ink">내 그룹</h2>
              <Button size="md" onClick={handleCreateGroup}>
                <Plus aria-hidden className="size-4" />
                그룹 만들기
              </Button>
            </div>
            {groups.error ? (
              <ErrorState
                message={getErrorMessage(groups.error)}
                onRetry={() => {
                  groups.refetch().catch(() => undefined);
                }}
              />
            ) : !groups.data ? (
              <Skeleton className="h-32 w-full" />
            ) : groups.data.myGroups.length === 0 ? (
              <EmptyState
                icon={<Users className="size-6" />}
                title="아직 참여한 그룹이 없어요"
                description="그룹을 만들거나 친구의 초대 링크로 참여해 보세요."
              />
            ) : (
              <div className="flex flex-col gap-3">
                {groups.data.myGroups.map((group) => {
                  const latest = group.contests[0];
                  return (
                    <GroupCard
                      key={group.id}
                      group={group}
                      latestContest={
                        latest ? (
                          <span className="flex items-center gap-2 text-caption text-muted">
                            <PhaseBadge phase={latest.phase} />
                            {latest.title}
                          </span>
                        ) : undefined
                      }
                    />
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
