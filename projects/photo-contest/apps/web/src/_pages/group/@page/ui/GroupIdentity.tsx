'use client';

import { useReadQuery } from '@apollo/client/react';

import { EditGroupProfileButton, GroupVisibilityBadge } from '@/features/group';
import { Avatar } from '@/shared/ui/@core/avatar';

import type { TGroupQueryRef } from '../model/group-query.type';

export function GroupIdentity({ groupRef }: { groupRef: TGroupQueryRef }) {
  const { data } = useReadQuery(groupRef);
  if (!data) return null;
  const { group } = data;
  return (
    <section className="mx-auto grid w-full max-w-5xl grid-cols-[auto_minmax(0,1fr)] items-center gap-4 border-b border-line pb-6 tablet:gap-6 desktop:grid-cols-[auto_minmax(0,1fr)_auto] desktop:rounded-card desktop:border desktop:bg-surface desktop:p-6">
      <Avatar
        name={group.name}
        src={group.avatarUrl}
        size="lg"
        className="size-20 border border-line bg-sunken text-ink"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-title-lg text-ink">{group.name}</p>
          <GroupVisibilityBadge visibility={group.visibility} />
        </div>
        <p className="mt-1 text-label text-ink">{group.memberCount}명이 함께하는 그룹</p>
        <p className="mt-2 text-caption whitespace-pre-wrap wrap-break-word text-muted">
          {group.description || '사진도 동영상도, 합성도 환영해요.'}
        </p>
      </div>
      <EditGroupProfileButton groupId={group.id} className="col-span-2 w-fit desktop:col-span-1" />
    </section>
  );
}
