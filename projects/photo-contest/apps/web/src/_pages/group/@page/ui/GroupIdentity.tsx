'use client';

import { useReadQuery } from '@apollo/client/react';
import { GroupVisibilityBadge } from '@/features/group';
import type { TGroupQueryRef } from '../model/group-query.type';

export function GroupIdentity({ groupRef }: { groupRef: TGroupQueryRef }) {
  const { data } = useReadQuery(groupRef);
  if (!data) return null;
  const { group } = data;
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-4 border-b border-line pb-6 tablet:gap-6 desktop:rounded-card desktop:border desktop:bg-surface desktop:p-6">
      <span
        aria-hidden
        className="flex size-20 shrink-0 items-center justify-center rounded-full border border-line bg-sunken text-display text-ink"
      >
        {Array.from(group.name.trim())[0] ?? '?'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-title-lg text-ink">{group.name}</p>
          <GroupVisibilityBadge visibility={group.visibility} />
        </div>
        <p className="mt-1 text-label text-ink">{group.memberCount}명이 함께하는 그룹</p>
        <p className="mt-2 text-caption text-muted">사진도 동영상도, 합성도 환영해요.</p>
      </div>
    </section>
  );
}
