'use client';

import { useReadQuery } from '@apollo/client/react';
import { overlay } from 'overlay-kit';
import { match } from 'ts-pattern';

import { Phase } from '@/shared/api/generated';
import { Button } from '@/shared/ui/@core/button';
import { StickyCta } from '@/shared/ui/@core/sticky-cta';

import type { TContestQueryRef } from '../../model/contest-query.type';
import { UploadPhotoBottomSheet } from './UploadPhotoBottomSheet';

export function ContestSubmissionCta({ contestRef }: { contestRef: TContestQueryRef }) {
  const { data } = useReadQuery(contestRef);
  if (!data) return null;
  const handleSubmitPhoto = () =>
    overlay.open(({ isOpen, close: onClose, unmount }) => (
      <UploadPhotoBottomSheet
        contestId={data.contest.id}
        isOpen={isOpen}
        onClose={onClose}
        unmount={unmount}
      />
    ));
  return match(data.contest.phase)
    .with(Phase.Submission, () => (
      <StickyCta>
        <Button fullWidth disabled={Boolean(data.contest.mySubmissionId)} onClick={handleSubmitPhoto}>
          {data.contest.mySubmissionId ? '사진 제출 완료' : '사진 제출하기'}
        </Button>
      </StickyCta>
    ))
    .with(Phase.Upcoming, Phase.Voting, Phase.Completed, () => null)
    .exhaustive();
}
