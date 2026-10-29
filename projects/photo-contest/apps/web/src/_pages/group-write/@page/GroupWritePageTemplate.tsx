'use client';

import { CreatePostForm } from '@/features/post';
import { ROUTES } from '@/shared/constants/routes';
import { useAppRouter } from '@/shared/model/router';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';

export function GroupWritePageTemplate({
  groupId,
  groupName,
  contestId,
}: {
  groupId: string;
  groupName: string;
  contestId?: string;
}) {
  const router = useAppRouter();
  const returnPath = contestId ? ROUTES.GROUP_CONTEST(groupId, contestId) : ROUTES.GROUP(groupId);
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <TopAppBar title="그룹에 글쓰기" backHref={returnPath} />
      <div className="mx-auto w-full max-w-5xl px-4 pt-6 tablet:px-8">
        <p className="wrap-anywhere text-subtitle text-ink">{groupName}</p>
        <p className="mt-2 text-body text-muted">사진도 동영상도, 직접 찍은 순간도 합성도 환영해요.</p>
      </div>
      <CreatePostForm
        groupId={groupId}
        defaultContestId={contestId}
        onCreated={() => router.replace(returnPath)}
      />
    </div>
  );
}
