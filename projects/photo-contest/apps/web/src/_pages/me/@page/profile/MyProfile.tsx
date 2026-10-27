'use client';

import Link from 'next/link';

import { useReadQuery, type QueryRef } from '@apollo/client/react';
import { overlay } from 'overlay-kit';

import { LogoutButton } from '@/features/auth';
import type { MeQuery } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { Avatar } from '@/shared/ui/@core/avatar';
import { Button } from '@/shared/ui/@core/button';

import { EditProfileBottomSheet } from './EditProfileBottomSheet';

export function MyProfile({ viewerRef }: { viewerRef: QueryRef<MeQuery> }) {
  const { data } = useReadQuery(viewerRef);
  const viewer = data.me;
  if (!viewer) return null;
  return (
    <section className="flex flex-col gap-5 border-b border-line pb-6 desktop:rounded-card desktop:border desktop:bg-surface desktop:p-6">
      <div className="flex items-center gap-4 desktop:flex-col desktop:items-start">
        <Avatar
          name={viewer.nickname}
          src={viewer.avatar}
          size="lg"
          className="size-20 text-display tablet:size-24"
        />
        <div className="min-w-0 flex-1">
          <div>
            <p className="mb-1 text-caption text-muted">나의 프로필</p>
            <h2 className="break-words text-title-lg text-ink">{viewer.nickname}</h2>
            <p className="mt-2 text-body text-muted">우리끼리 모은 순간을 다시 만나보세요.</p>
          </div>
        </div>
      </div>
      {viewer.isAnonymous ? (
        <div className="space-y-2 text-caption text-muted">
          <p>익명 프로필은 이 브라우저의 세션으로 유지돼요.</p>
          <p>
            다른 기기에서도 프로필과 기록을 이어가고 싶다면{' '}
            <Link
              href={`${ROUTES.SIGN}?${new URLSearchParams({ next: ROUTES.ME, mode: 'register' })}`}
              className="font-semibold text-ink underline underline-offset-4"
            >
              회원가입
            </Link>
            해 주세요.
          </p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            overlay.open(({ isOpen, close, unmount }) => (
              <EditProfileBottomSheet isOpen={isOpen} onClose={() => close()} unmount={unmount} />
            ))
          }
        >
          프로필 수정
        </Button>
        <LogoutButton isAnonymous={viewer.isAnonymous} />
      </div>
    </section>
  );
}
