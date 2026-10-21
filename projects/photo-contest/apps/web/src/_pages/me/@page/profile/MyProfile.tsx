'use client';

import { useReadQuery, type QueryRef } from '@apollo/client/react';

import { LogoutButton } from '@/features/auth';
import type { MeQuery } from '@/shared/api/generated';
import { Avatar } from '@/shared/ui/@core/avatar';

export function MyProfile({ viewerRef }: { viewerRef: QueryRef<MeQuery> }) {
  const { data } = useReadQuery(viewerRef);
  const viewer = data.me;
  if (!viewer) return null;
  return (
    <section className="flex flex-wrap items-center gap-6 border-b border-line pb-8 tablet:gap-10 tablet:px-6 desktop:flex-col desktop:items-start desktop:gap-5 desktop:rounded-card desktop:border desktop:bg-surface desktop:p-6">
      <Avatar
        name={viewer.nickname}
        src={viewer.avatar}
        size="lg"
        className="size-20 text-display tablet:size-24"
      />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-4">
        <div>
          <p className="mb-1 text-caption text-muted">나의 프로필</p>
          <h2 className="break-words text-title-lg text-ink">{viewer.nickname}</h2>
          <p className="mt-2 text-body text-muted">우리끼리 모은 순간을 다시 만나보세요.</p>
        </div>
        <div>
          <LogoutButton />
        </div>
      </div>
    </section>
  );
}
