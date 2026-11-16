'use client';

import { useMutation, useQuery } from '@apollo/client/react';

import { useLoginPrompt } from '@/features/auth';
import { prependMyGroup } from '@/features/group';
import { resetGalleryPosts } from '@/features/post';
import { GroupVisibility, JoinGroupDocument, MeDocument } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { useAppRouter } from '@/shared/model/router';
import { Button } from '@/shared/ui/@core/button';

/** 초대 수락. 가입하면 홈 목록에 넣고 그룹 화면으로 바꿔 간다(뒤로 가기가 초대 화면으로 돌아오지 않게). */
export function JoinGroupButton({
  token,
  visibility = GroupVisibility.Public,
}: {
  token: string;
  visibility?: GroupVisibility;
}) {
  const router = useAppRouter();
  const promptLogin = useLoginPrompt();
  const { data: viewer } = useQuery(MeDocument, { fetchPolicy: 'cache-only' });
  const [joinGroup, { loading, data }] = useMutation(JoinGroupDocument, {
    variables: { token },
    update: (cache, { data: result }) => {
      if (result) {
        prependMyGroup(cache, result.joinGroup);
        resetGalleryPosts(cache);
      }
    },
    onCompleted: ({ joinGroup: group }) => {
      if (group.role) trackEvent(ANALYTICS_EVENT.GroupJoined, { group_id: group.id });
      router.replace(ROUTES.GROUP(group.id));
    },
  });

  if (visibility === GroupVisibility.Private && viewer?.me?.isAnonymous)
    return (
      <Button onClick={() => promptLogin(ROUTES.INVITE(token))} fullWidth>
        로그인하고 가입 신청하기
      </Button>
    );

  return (
    // 그룹 화면으로 옮겨 가는 동안 다시 누르지 못하게 가입한 뒤에도 진행 중으로 둔다.
    <Button
      fullWidth
      loading={loading || Boolean(data)}
      onClick={async () => {
        try {
          await joinGroup();
        } catch {
          // 실패는 ErrorLink가 토스트로 알린다.
        }
      }}
    >
      {visibility === GroupVisibility.Private ? '가입 신청하기' : '초대 수락하고 가입하기'}
    </Button>
  );
}
