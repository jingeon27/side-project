'use client';

import { useFragment, useMutation, useQuery } from '@apollo/client/react';
import {
  CastGroupContestVoteDocument,
  GalleryPostCardFragmentDoc,
  GroupContestSummaryFragmentDoc,
  MeDocument,
  Phase,
} from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { toast } from '@/shared/model/toast';
import { Button, ButtonLink } from '@/shared/ui/@core/button';

export function GroupContestVoteButton({ contestId, postId }: { contestId: string; postId: string }) {
  const { data: contest, complete } = useFragment({
    fragment: GroupContestSummaryFragmentDoc,
    from: { __typename: 'GroupContest', id: contestId },
  });
  const { data: post, complete: postComplete } = useFragment({
    fragment: GalleryPostCardFragmentDoc,
    fragmentName: 'GalleryPostCard',
    from: { __typename: 'GalleryPost', id: postId },
  });
  const { data: viewer } = useQuery(MeDocument, { fetchPolicy: 'cache-only' });
  const [vote, { loading }] = useMutation(CastGroupContestVoteDocument, {
    onCompleted: () => toast.success('투표했어요. 종료 후 결과를 확인해 주세요.'),
  });
  if (!complete || !postComplete || contest.phase !== Phase.Voting) return null;
  if (!viewer?.me || !post.canInteract)
    return (
      <ButtonLink href={ROUTES.GROUP(contest.groupId)} variant="secondary" fullWidth>
        그룹 가입 후 투표하기
      </ButtonLink>
    );
  const mine = post.author.id === viewer.me.id;
  const selected = contest.votedPostId === postId;
  return (
    <Button
      fullWidth
      variant={selected ? 'primary' : 'secondary'}
      disabled={mine || !contest.canVote}
      loading={loading}
      onClick={async () => {
        try {
          await vote({ variables: { contestId, postId } });
        } catch {
          /* ErrorLink가 알린다. */
        }
      }}
      aria-label={`${post.title} 대회 투표`}
    >
      {selected
        ? '내가 투표한 참여작'
        : mine
          ? '내가 올린 참여작'
          : contest.votedPostId
            ? '투표 완료'
            : '이 참여작에 투표하기'}
    </Button>
  );
}
