'use client';

import { useQuery } from '@apollo/client/react';
import { Users } from 'lucide-react';

import { LoginPanel } from '@/features/auth';
import { JoinGroupButton } from '@/features/invite';
import { InvitePreviewDocument, MeDocument } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { getErrorMessage } from '@/shared/model/error';
import { ButtonLink } from '@/shared/ui/@core/button';
import { ErrorState } from '@/shared/ui/@core/error-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';

export function InvitePageTemplate({ token }: { token: string }) {
  const me = useQuery(MeDocument);
  const query = useQuery(InvitePreviewDocument, { variables: { token }, errorPolicy: 'all' });
  const preview = query.data?.invitePreview;
  return (
    <div className="flex flex-1 flex-col">
      <TopAppBar title="친구의 초대" backHref={ROUTES.HOME} />
      <div className="flex flex-col gap-6 p-4">
        {!preview ? (
          query.error ? (
            <ErrorState title="초대 링크를 확인해 주세요" message={getErrorMessage(query.error)} />
          ) : (
            <Skeleton className="h-48 w-full" />
          )
        ) : (
          <>
            <section className="flex flex-col items-center gap-3 rounded-card bg-brand-soft px-5 py-8 text-center">
              <Users aria-hidden className="size-10 text-brand" />
              <h2 className="break-words text-title-lg text-ink">{preview.groupName}</h2>
              <p className="text-body text-muted">
                {preview.ownerNickname}님이 기다리고 있어요. 친구 {preview.memberCount}명과 사진 대회를
                즐겨보세요.
              </p>
            </section>
            {preview.joinedGroupId ? (
              <ButtonLink href={ROUTES.GROUP(preview.joinedGroupId)}>이미 가입한 그룹으로 이동</ButtonLink>
            ) : !me.data ? (
              <Skeleton className="h-16 w-full" />
            ) : me.data.me ? (
              <JoinGroupButton token={token} />
            ) : (
              <LoginPanel nextPath={ROUTES.INVITE(token)} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
