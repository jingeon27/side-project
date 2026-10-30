'use client';

import { useReadQuery } from '@apollo/client/react';
import { Share2 } from 'lucide-react';

import { buildContestShareText, useShareActions } from '@/features/share';
import { ROUTES } from '@/shared/constants/routes';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { IconButton } from '@/shared/ui/@core/icon-button';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';

import type { TContestQueryRef } from '../model/contest-query.type';

export function ContestHeader({ contestRef }: { contestRef: TContestQueryRef }) {
  const { data } = useReadQuery(contestRef);
  const shareActions = useShareActions();
  if (!data) return null;
  const { contest } = data;
  const handleShare = async () => {
    const method = await shareActions.share(
      window.location.origin + ROUTES.CONTEST(contest.id),
      { title: '피식 사진 대회', text: buildContestShareText(contest.title) },
      { copied: '대회 링크를 복사했어요' },
    );
    if (method) trackEvent(ANALYTICS_EVENT.ContestShared, { contest_id: contest.id, method });
  };
  return (
    <TopAppBar
      title={contest.title}
      backHref={ROUTES.GROUP(contest.groupId)}
      actions={
        <IconButton label="대회 공유" onClick={handleShare}>
          <Share2 className="size-5" />
        </IconButton>
      }
    />
  );
}
