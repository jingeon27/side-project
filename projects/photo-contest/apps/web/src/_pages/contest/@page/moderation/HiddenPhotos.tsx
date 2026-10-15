'use client';

import { useReadQuery } from '@apollo/client/react';

import { ModerationActions } from '@/features/moderation';
import { SubmissionCard } from '@/features/submission';
import { Phase } from '@/shared/api/generated';

import type { TContestQueryRef } from '../model/contest-query.type';

export function HiddenPhotos({ contestRef, viewerId }: { contestRef: TContestQueryRef; viewerId: string }) {
  const { data } = useReadQuery(contestRef);
  if (!data || !data.contest.isAdmin || !data.contest.hiddenSubmissions.length) return null;
  const { contest } = data;
  return (
    <section className="grid items-start gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
      <h2 className="col-span-full text-title text-ink">숨긴 사진</h2>
      {contest.hiddenSubmissions.map((submission) => (
        <SubmissionCard
          key={submission.id}
          submission={submission}
          viewerId={viewerId}
          moderation={
            <ModerationActions
              submission={submission}
              contestId={contest.id}
              isAdmin
              isMine={submission.author.id === viewerId}
              isCompleted={contest.phase === Phase.Completed}
            />
          }
        />
      ))}
    </section>
  );
}
