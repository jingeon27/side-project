'use client';

import { useReadQuery } from '@apollo/client/react';
import { LockKeyhole } from 'lucide-react';
import { GroupMembershipButton } from '@/features/group';
import { Button } from '@/shared/ui/@core/button';
import type { TGroupQueryRef } from '../model/group-query.type';

export function PrivateGroupNotice({
  groupRef,
  onRefresh,
}: {
  groupRef: TGroupQueryRef;
  onRefresh: () => Promise<unknown>;
}) {
  const { data } = useReadQuery(groupRef);
  if (!data) return null;
  const { group } = data;
  return (
    <section
      className="mx-auto flex w-full max-w-app flex-col items-center gap-4 rounded-card border border-line bg-surface px-5 py-12 text-center"
      aria-label="비공개 그룹 안내"
    >
      <LockKeyhole aria-hidden className="size-8 text-muted" />
      <h2 className="text-title text-ink">비공개 그룹이에요</h2>
      <p className="text-body text-muted">그룹장이 가입 신청을 수락하면 사진·동영상과 댓글을 볼 수 있어요.</p>
      <GroupMembershipButton groupId={group.id} />
      {group.joinRequestPending ? (
        <Button
          variant="ghost"
          onClick={() => {
            void onRefresh().catch(() => undefined);
          }}
        >
          승인 상태 확인
        </Button>
      ) : null}
    </section>
  );
}
