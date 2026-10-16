'use client';

import { useBackgroundQuery, useQueryRefHandlers, useReadQuery } from '@apollo/client/react';
import type { QueryRef } from '@apollo/client/react';
import { Users } from 'lucide-react';
import { match, P } from 'ts-pattern';

import { LoginPanel, ViewerBoundary } from '@/features/auth';
import { JoinGroupButton } from '@/features/invite';
import { InvitePreviewDocument } from '@/shared/api/generated';
import type { InvitePreviewQuery, InvitePreviewQueryVariables } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { getErrorMessage } from '@/shared/model/error';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { ButtonLink } from '@/shared/ui/@core/button';
import { ErrorState } from '@/shared/ui/@core/error-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';

function InviteContent({
  token,
  previewRef,
}: {
  token: string;
  previewRef: QueryRef<InvitePreviewQuery, InvitePreviewQueryVariables, 'empty' | 'complete' | 'streaming'>;
}) {
  const { data, error } = useReadQuery(previewRef);
  const { refetch } = useQueryRefHandlers(previewRef);
  if (!data)
    return (
      <ErrorState
        title="초대 링크를 확인해 주세요"
        message={getErrorMessage(error)}
        onRetry={() => {
          void refetch().catch(() => undefined);
        }}
      />
    );
  const { invitePreview: preview } = data;
  return (
    <>
      <section className="flex flex-col items-center gap-3 rounded-card bg-brand-soft px-5 py-8 text-center">
        <Users aria-hidden className="size-10 text-brand" />
        <h2 className="break-words text-title-lg text-ink">{preview.groupName}</h2>
        <p className="text-body text-muted">
          {preview.ownerNickname}님이 기다리고 있어요. 친구 {preview.memberCount}명과 사진과 동영상을
          나눠보세요.
        </p>
      </section>
      {match(preview.joinedGroupId)
        .with(P.string, (groupId) => (
          <ButtonLink href={ROUTES.GROUP(groupId)}>이미 가입한 그룹으로 이동</ButtonLink>
        ))
        .with(null, () => (
          <ViewerBoundary
            guest={<LoginPanel nextPath={ROUTES.INVITE(token)} />}
            fallback={<Skeleton className="h-16 w-full" />}
          >
            {() => <JoinGroupButton token={token} />}
          </ViewerBoundary>
        ))
        .exhaustive()}
    </>
  );
}
export function InvitePageTemplate({ token }: { token: string }) {
  const [previewRef, { refetch }] = useBackgroundQuery(InvitePreviewDocument, {
    variables: { token },
    errorPolicy: 'all',
  });
  return (
    <div className="flex flex-1 flex-col">
      <TopAppBar title="친구의 초대" backHref={ROUTES.HOME} />
      <div className="flex flex-col gap-6 p-4">
        <AsyncBoundary
          resetKey={token}
          fallback={<Skeleton className="h-48 w-full" />}
          errorTitle="초대 링크를 확인해 주세요"
          onRetry={refetch}
        >
          <InviteContent token={token} previewRef={previewRef} />
        </AsyncBoundary>
      </div>
    </div>
  );
}
