'use client';

import { useId } from 'react';
import Link from 'next/link';

import { useFragment, useQuery } from '@apollo/client/react';
import { ArrowUpRight, Users } from 'lucide-react';
import { match, P } from 'ts-pattern';

import { useLoginPrompt } from '@/features/auth';
import { DiscoverGroupFragmentDoc, GroupVisibility, MeDocument } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { formatCount } from '@/shared/lib/format.helper';
import { useIsSSR } from '@/shared/model/is-ssr.hook';
import { Avatar } from '@/shared/ui/@core/avatar';

import { GroupMembershipButton } from '../../membership/GroupMembershipButton';
import { GroupVisibilityBadge } from './GroupVisibilityBadge';

export function DiscoverGroupCard({ id, joinable = false }: { id: string; joinable?: boolean }) {
  const detailsId = useId();
  const isSSR = useIsSSR();
  const promptLogin = useLoginPrompt();
  const { data: viewer } = useQuery(MeDocument, { fetchPolicy: 'cache-only' });
  const { data: group, complete } = useFragment({
    fragment: DiscoverGroupFragmentDoc,
    fragmentName: 'DiscoverGroup',
    from: { __typename: 'Group', id },
  });
  if (!complete) return null;
  const actionLabel = match(group)
    .with({ role: P.nonNullable }, () => '그룹으로 가기')
    .with({ joinRequestPending: true }, () => '신청 상태 보기')
    .with({ joinRequestPending: false }, () => '둘러보기')
    .exhaustive();
  const privateGroup = group.visibility === GroupVisibility.Private;
  const viewerPending = isSSR || !viewer;
  return (
    // 링크 글자는 그룹 이름 하나라 보이는 글자가 곧 접근 이름이다(WCAG 2.5.3). 카드 전체를 누르는 영역은
    // 링크의 가상 요소가 덮고, 공개 범위·멤버 수·행동은 aria-describedby로 함께 읽는다.
    <article className="relative flex min-w-0 flex-col rounded-sheet bg-sunken transition-colors has-[a:hover]:bg-neutral-soft has-[a:active]:bg-neutral-soft">
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <p id={detailsId} className="sr-only">
          {privateGroup ? '비공개 그룹' : '공개 그룹'}. 멤버 {formatCount(group.memberCount)}명. {actionLabel}
          .
        </p>
        <div className="flex min-w-0 items-center gap-3">
          <Avatar
            name={group.name}
            src={group.avatarUrl}
            size="lg"
            shape="squircle"
            tone="gradient"
            className="size-12"
          />
          <h3 className="min-w-0 flex-1 wrap-anywhere text-subtitle font-bold text-ink">
            <Link
              href={ROUTES.GROUP(id)}
              aria-describedby={detailsId}
              aria-disabled={privateGroup && viewerPending}
              inert={privateGroup && viewerPending}
              className="rounded-control after:absolute after:inset-0 after:rounded-sheet"
              onClick={(event) => {
                if (!privateGroup) return;
                if (viewerPending) {
                  event.preventDefault();
                  return;
                }
                if (viewer.me && !viewer.me.isAnonymous) return;
                event.preventDefault();
                promptLogin(ROUTES.GROUP(id));
              }}
            >
              {group.name}
            </Link>
          </h3>
          <GroupVisibilityBadge visibility={group.visibility} />
        </div>
        <p className="line-clamp-2 flex-1 wrap-anywhere text-caption text-muted">
          {group.description ||
            (privateGroup
              ? '그룹장의 수락 후 함께 나눌 수 있어요.'
              : '사진과 동영상, 합성한 이미지를 함께 나눠요.')}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-caption">
          <span className="flex items-center gap-1.5 text-muted">
            <Users aria-hidden className="size-3.5" />
            멤버 {formatCount(group.memberCount)}명
          </span>
          <span className="flex items-center gap-1.5 text-label text-ink">
            {actionLabel}
            <ArrowUpRight aria-hidden className="size-3.5" />
          </span>
        </div>
      </div>
      {joinable && !group.role ? (
        // 링크 가상 요소보다 뒤에 오는 위치 지정 요소라 그 위에 그려져 가입 버튼을 누를 수 있다.
        <div className="relative flex justify-end border-t border-line/70 px-4 py-3">
          <GroupMembershipButton groupId={id} />
        </div>
      ) : null}
    </article>
  );
}
