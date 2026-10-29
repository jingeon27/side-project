'use client';

import { useFragment, useMutation, useQuery } from '@apollo/client/react';

import { useLoginPrompt } from '@/features/auth';
import { resetGalleryPosts } from '@/features/post';
import {
  DiscoverGroupsDocument,
  GalleryDocument,
  GalleryPostsDocument,
  GroupAccessFragmentDoc,
  GroupVisibility,
  MeDocument,
  MyGroupsDocument,
  RequestGroupMembershipDocument,
} from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { buildLoginRedirectPath } from '@/shared/lib/auth-gate.helper';
import { toast } from '@/shared/model/toast';
import { Button, ButtonLink } from '@/shared/ui/@core/button';

import { prependMyGroup } from '../../model/group.cache';

export function GroupMembershipButton({ groupId }: { groupId: string }) {
  const promptLogin = useLoginPrompt();
  const { data: viewer } = useQuery(MeDocument, { fetchPolicy: 'cache-only' });
  const { data: group, complete } = useFragment({
    fragment: GroupAccessFragmentDoc,
    from: { __typename: 'Group', id: groupId },
  });
  const [join, { loading }] = useMutation(RequestGroupMembershipDocument, {
    update: (cache, { data }) => {
      if (!data) return;
      prependMyGroup(cache, data.requestGroupMembership);
      if (data.requestGroupMembership.role) resetGalleryPosts(cache);
    },
    refetchQueries: [GalleryDocument, DiscoverGroupsDocument, MyGroupsDocument, GalleryPostsDocument],
    awaitRefetchQueries: true,
    onCompleted: ({ requestGroupMembership: result }) => {
      toast.success(
        result.role ? '그룹에 가입했어요' : '가입 신청을 보냈어요. 그룹장의 수락을 기다려 주세요.',
      );
    },
  });
  if (!complete || group.role) return null;
  if (viewer?.me?.isAnonymous && group.visibility === GroupVisibility.Private)
    return (
      <Button onClick={() => promptLogin(ROUTES.GROUP(groupId))} size="md">
        로그인하고 가입 신청하기
      </Button>
    );
  if (!viewer?.me)
    return (
      <ButtonLink href={buildLoginRedirectPath(ROUTES.GROUP(groupId))} size="md">
        로그인하고 가입하기
      </ButtonLink>
    );
  if (group.joinRequestPending)
    return (
      <Button variant="secondary" size="md" disabled>
        가입 승인 대기 중
      </Button>
    );
  return (
    <Button
      size="md"
      loading={loading}
      onClick={async () => {
        try {
          await join({ variables: { groupId } });
        } catch {
          /* ErrorLink가 알린다. */
        }
      }}
    >
      {group.visibility === GroupVisibility.Private ? '가입 신청하기' : '그룹 가입하기'}
    </Button>
  );
}
