'use client';

import { useReadQuery } from '@apollo/client/react';
import type { QueryRef } from '@apollo/client/react';

import { LogoutButton } from '@/features/auth';
import type { MeQuery } from '@/shared/api/generated';
import { Avatar } from '@/shared/ui/@core/avatar';

export function MyProfile({ viewerRef }: { viewerRef: QueryRef<MeQuery> }) {
  const { data } = useReadQuery(viewerRef);
  const viewer = data.me;
  if (!viewer) return null;
  return (
    <div className="flex flex-col gap-4">
      <section className="flex items-center gap-4 rounded-card bg-brand-soft p-5">
        <Avatar name={viewer.nickname} src={viewer.avatar} />
        <div className="min-w-0">
          <h2 className="break-words text-title text-ink">{viewer.nickname}</h2>
          <p className="mt-1 text-caption text-muted">우리끼리 모은 순간을 다시 만나보세요.</p>
        </div>
      </section>
      <LogoutButton />
    </div>
  );
}
