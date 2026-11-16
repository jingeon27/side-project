'use client';

import Image from 'next/image';

import { useReadQuery } from '@apollo/client/react';
import { UsersRound } from 'lucide-react';

import { EditGroupProfileLink, GroupMembershipButton, GroupVisibilityBadge } from '@/features/group';
import { Avatar } from '@/shared/ui/@core/avatar';
import { Button } from '@/shared/ui/@core/button';

import type { TGroupQueryRef } from '../../model/group-query.type';

export function GroupIdentity({
  groupRef,
  onOpenCommunity,
}: {
  groupRef: TGroupQueryRef;
  onOpenCommunity: () => void;
}) {
  const { data } = useReadQuery(groupRef);
  if (!data) return null;
  const { group } = data;
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 border-b border-line pb-6 tablet:gap-6">
      {group.coverUrl ? (
        <div className="relative col-span-full aspect-[3/1] w-full overflow-hidden rounded-card bg-sunken">
          <Image
            src={group.coverUrl}
            alt={`${group.name} 배경 사진`}
            fill
            unoptimized
            className="object-cover"
            sizes="(min-width: 1024px) 900px, 100vw"
          />
        </div>
      ) : null}
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-4 tablet:gap-6 desktop:grid-cols-[auto_minmax(0,1fr)_auto]">
        <Avatar
          name={group.name}
          src={group.avatarUrl}
          size="lg"
          shape="squircle"
          tone="gradient"
          className="text-title-lg tablet:size-20"
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 wrap-anywhere text-title-lg text-ink">{group.name}</p>
            <GroupVisibilityBadge visibility={group.visibility} />
          </div>
          <p className="mt-1 text-caption text-muted">{group.memberCount}명이 함께하는 그룹</p>
        </div>
        <div className="col-span-full flex min-w-0 flex-wrap items-center gap-2 desktop:col-span-1">
          {!group.role && group.canViewPosts ? <GroupMembershipButton groupId={group.id} /> : null}
          {group.role && group.inviteToken ? (
            <Button
              variant="secondary"
              size="md"
              className="h-auto min-h-touch max-w-full py-2 whitespace-normal wrap-anywhere"
              aria-controls={`group-community-${group.id}`}
              onClick={onOpenCommunity}
            >
              <UsersRound aria-hidden className="size-4" /> 초대와 멤버 보기
            </Button>
          ) : null}
          <EditGroupProfileLink
            groupId={group.id}
            className="h-auto min-h-touch max-w-full py-2 whitespace-normal wrap-anywhere"
          />
        </div>
      </div>
      <p className="max-w-prose text-caption whitespace-pre-wrap wrap-anywhere text-muted">
        {group.description || '사진과 동영상으로 웃긴 순간을 나눠보세요.'}
      </p>
    </section>
  );
}
