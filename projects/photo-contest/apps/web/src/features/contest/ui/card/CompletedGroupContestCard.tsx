'use client';

import Image from 'next/image';
import Link from 'next/link';

import { Link2, Trophy, Video } from 'lucide-react';
import { match, P } from 'ts-pattern';

import { PostKind } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { formatDateTime } from '@/shared/lib/format.helper';

import { useGroupContestCard } from './group-contest-card.hook';
import { GroupContestCardFrame } from './GroupContestCardFrame';
import { GroupContestCardLink } from './GroupContestCardLink';

/** 종료된 그룹 대회 카드. 우승작을 순위와 득표수로 보여 준다. */
export function CompletedGroupContestCard({ id }: { id: string }) {
  const fragment = useGroupContestCard(id);
  if (!fragment.complete) return null;
  return (
    <GroupContestCardFrame contest={fragment.data} schedule={`종료 ${formatDateTime(fragment.data.endsAt)}`}>
      <section
        aria-label={`${fragment.data.title} 우승작`}
        className="flex flex-col gap-4 border-t border-line pt-5"
      >
        {fragment.data.winners.length ? (
          fragment.data.winners.map((winner) => (
            <Link
              key={winner.post.id}
              href={`${ROUTES.GROUP_CONTEST(fragment.data.groupId, id)}#post-${winner.post.id}`}
              className="flex min-w-0 items-center gap-3"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-ink text-label text-surface">
                {winner.rank}
              </span>
              <div className="relative size-16 shrink-0 overflow-hidden rounded-control bg-sunken">
                {match(winner.post)
                  .with({ kind: PostKind.Photo, mediaUrl: P.string.minLength(1) }, (post) => (
                    <Image
                      unoptimized
                      fill
                      sizes="64px"
                      src={post.mediaUrl}
                      alt={post.title}
                      className="object-cover"
                    />
                  ))
                  .with({ kind: PostKind.Link }, () => (
                    <Link2 aria-label="링크 우승작" className="m-auto h-full w-6 text-muted" />
                  ))
                  .with({ kind: P.union(PostKind.Photo, PostKind.Video) }, () => (
                    <Video aria-label="동영상 우승작" className="m-auto h-full w-6 text-muted" />
                  ))
                  .exhaustive()}
              </div>
              <div className="min-w-0">
                <p className="line-clamp-2 text-label text-ink">{winner.post.title}</p>
                <p className="mt-1 flex flex-wrap gap-x-2 text-caption text-muted">
                  <span className="min-w-0 wrap-break-word">{winner.post.author.nickname}</span>
                  <span>{winner.voteCount}표</span>
                </p>
              </div>
              <Trophy aria-label="우승" className="ml-auto size-5 shrink-0 text-muted" />
            </Link>
          ))
        ) : (
          <p className="text-body text-muted">투표로 선정된 우승작이 없어요.</p>
        )}
      </section>
      <GroupContestCardLink contest={fragment.data}>대회 결과 보기</GroupContestCardLink>
    </GroupContestCardFrame>
  );
}
