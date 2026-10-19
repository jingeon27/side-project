'use client';

import { useFragment } from '@apollo/client/react';
import { Link2, Trophy, Video } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { GroupContestCardFragmentDoc, PostKind } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { formatDateTime } from '@/shared/lib/format.helper';
import { PhaseBadge } from './PhaseBadge';

export function GroupContestCard({ id, hallOfFame = false }: { id: string; hallOfFame?: boolean }) {
  const { data: contest, complete } = useFragment({
    fragment: GroupContestCardFragmentDoc,
    fragmentName: 'GroupContestCard',
    from: { __typename: 'GroupContest', id },
  });
  if (!complete) return null;
  const href = ROUTES.GROUP_CONTEST(contest.groupId, id);
  return (
    <article
      aria-label={contest.title}
      className="flex min-w-0 flex-col gap-5 rounded-card border border-line bg-surface p-5 tablet:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PhaseBadge phase={contest.phase} />
        <p className="text-caption text-muted">참여작 {contest.entryCount}개</p>
      </div>
      <div>
        <Link
          href={href}
          className="wrap-break-word text-title-lg text-ink hover:underline underline-offset-4"
        >
          {contest.title}
        </Link>
        <p className="mt-2 text-caption text-muted">
          {hallOfFame
            ? `종료 ${formatDateTime(contest.endsAt)}`
            : `접수 마감 ${formatDateTime(contest.submissionEndsAt)}`}
        </p>
      </div>
      {hallOfFame ? (
        <section
          aria-label={`${contest.title} 우승작`}
          className="flex flex-col gap-4 border-t border-line pt-5"
        >
          {contest.winners.length ? (
            contest.winners.map(({ post, rank, voteCount }) => (
              <Link
                key={post.id}
                href={`${href}#post-${post.id}`}
                className="flex min-w-0 items-center gap-3"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-ink text-label text-surface">
                  {rank}
                </span>
                <div className="relative size-16 shrink-0 overflow-hidden rounded-control bg-sunken">
                  {post.kind === PostKind.Photo && post.mediaUrl ? (
                    <Image
                      unoptimized
                      fill
                      sizes="64px"
                      src={post.mediaUrl}
                      alt={post.title}
                      className="object-cover"
                    />
                  ) : post.kind === PostKind.Link ? (
                    <Link2 aria-label="링크 우승작" className="m-auto h-full w-6 text-muted" />
                  ) : (
                    <Video aria-label="동영상 우승작" className="m-auto h-full w-6 text-muted" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="line-clamp-2 text-label text-ink">{post.title}</p>
                  <p className="mt-1 text-caption text-muted">
                    {post.author.nickname} · {voteCount}표
                  </p>
                </div>
                <Trophy aria-label="우승" className="ml-auto size-5 shrink-0 text-muted" />
              </Link>
            ))
          ) : (
            <p className="text-body text-muted">투표로 선정된 우승작이 없어요.</p>
          )}
        </section>
      ) : (
        <p className="text-body text-muted">사진도 동영상도, 나만의 웃긴 순간으로 참여해 보세요.</p>
      )}
      <Link
        href={href}
        className="mt-auto min-h-touch content-center text-label text-ink underline underline-offset-4"
      >
        {hallOfFame ? '대회 결과 보기' : '대회 둘러보기'}
      </Link>
    </article>
  );
}
