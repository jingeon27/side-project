'use client';

import { useMutation } from '@apollo/client/react';

import { prependMyGroup } from '@/features/group';
import { resetGalleryPosts } from '@/features/post';
import { resetPhotoFeed } from '@/features/feed';
import { JoinGroupDocument } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { useAppRouter } from '@/shared/model/router';
import { Button } from '@/shared/ui/@core/button';

/** 초대 수락. 가입하면 홈 목록에 넣고 갤러리 화면으로 바꿔 간다(뒤로 가기가 초대 화면으로 돌아오지 않게). */
export function JoinGroupButton({ token }: { token: string }) {
  const router = useAppRouter();
  const [joinGroup, { loading, data }] = useMutation(JoinGroupDocument, {
    variables: { token },
    update: (cache, { data: result }) => {
      if (result) {
        prependMyGroup(cache, result.joinGroup);
        resetPhotoFeed(cache);
        resetGalleryPosts(cache);
      }
    },
    onCompleted: ({ joinGroup: group }) => {
      trackEvent(ANALYTICS_EVENT.GroupJoined, { group_id: group.id });
      router.replace(ROUTES.GROUP(group.id));
    },
  });

  const handleJoin = async () => {
    try {
      await joinGroup();
    } catch {
      // 실패는 ErrorLink가 토스트로 알린다.
    }
  };

  return (
    // 갤러리 화면으로 옮겨 가는 동안 다시 누르지 못하게 가입한 뒤에도 진행 중으로 둔다.
    <Button fullWidth loading={loading || Boolean(data)} onClick={handleJoin}>
      초대 수락하고 가입하기
    </Button>
  );
}
