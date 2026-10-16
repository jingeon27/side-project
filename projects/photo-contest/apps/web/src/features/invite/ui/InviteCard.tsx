'use client';

import { useMutation } from '@apollo/client/react';
import { Copy, RefreshCw, Share2 } from 'lucide-react';
import { overlay } from 'overlay-kit';
import { useId, useSyncExternalStore } from 'react';

import { buildInviteShareText, useShareActions } from '@/features/share';
import { RegenerateInviteLinkDocument } from '@/shared/api/generated';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { toast } from '@/shared/model/toast';
import { Button } from '@/shared/ui/@core/button';
import { ConfirmDialog } from '@/shared/ui/@core/confirm-dialog';

import { buildInviteUrl } from '../lib/invite-link.helper';

interface IInviteCardProps {
  groupId: string;
  groupName: string;
  inviteToken: string;
  /** 관리자만 링크를 새로 만들 수 있다. */
  canRegenerate: boolean;
}

const COPIED_MESSAGE = '초대 링크를 복사했어요';

const subscribeNothing = () => () => undefined;

/**
 * 갤러리 초대 카드(모든 멤버). 공유는 앱 공유 시트 → Web Share → 복사 순서로, 복사는 앱 클립보드 → 브라우저 순서로 한다.
 * 관리자는 링크를 새로 만들 수 있고, 그러면 이전 링크로는 가입할 수 없다.
 */
export function InviteCard({ groupId, groupName, inviteToken, canRegenerate }: IInviteCardProps) {
  const headingId = useId();
  // 서버 렌더링과 첫 hydration에서는 origin을 몰라 상대 경로를 쓰고, 브라우저에서 바로 절대 주소로 바꾼다.
  const origin = useSyncExternalStore(
    subscribeNothing,
    () => window.location.origin,
    () => '',
  );
  const inviteUrl = buildInviteUrl(origin, inviteToken);
  const shareActions = useShareActions();
  const [regenerateInviteLink] = useMutation(RegenerateInviteLinkDocument, {
    variables: { groupId },
    onCompleted: () => {
      trackEvent(ANALYTICS_EVENT.InviteLinkRegenerated, { group_id: groupId });
      toast.success('새 초대 링크를 만들었어요', { description: '이전 링크로는 더 이상 가입할 수 없어요.' });
    },
  });

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-card bg-brand-soft p-4">
      <div>
        <h2 id={headingId} className="text-subtitle text-ink">
          친구가 많을수록 웃음도 커져요
        </h2>
        <p className="mt-1 text-caption text-muted">
          초대 링크를 아는 사람은 누구나 가입할 수 있어요. 친구에게만 보내 주세요.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="primary"
          size="md"
          onClick={async () => {
            const method = await shareActions.share(
              inviteUrl,
              { title: '웃긴순간 갤러리 초대', text: buildInviteShareText(groupName) },
              { copied: COPIED_MESSAGE },
            );
            if (method) trackEvent(ANALYTICS_EVENT.InviteLinkShared, { group_id: groupId, method });
          }}
        >
          <Share2 aria-hidden className="size-4" />
          친구 초대하기
        </Button>
        <Button
          variant="secondary"
          onClick={async () => {
            const method = await shareActions.copy(inviteUrl, { copied: COPIED_MESSAGE });
            if (method) trackEvent(ANALYTICS_EVENT.InviteLinkCopied, { group_id: groupId, method });
          }}
        >
          <Copy aria-hidden className="size-4" />
          링크 복사
        </Button>
      </div>
      <input
        aria-label="갤러리 초대 링크"
        readOnly
        value={inviteUrl}
        onFocus={(event) => event.currentTarget.select()}
        className="h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-caption text-muted outline-none focus:border-brand"
      />
      {canRegenerate ? (
        <Button
          variant="ghost"
          size="sm"
          className="self-start text-muted"
          onClick={() =>
            overlay.open(({ isOpen, close, unmount }) => (
              <ConfirmDialog
                isOpen={isOpen}
                onClose={close}
                unmount={unmount}
                title="초대 링크를 새로 만들까요?"
                description="지금 링크는 더 이상 쓸 수 없어요. 새 링크를 친구들에게 다시 보내 주세요."
                confirmLabel="새 링크 만들기"
                onConfirm={() => regenerateInviteLink()}
              />
            ))
          }
        >
          <RefreshCw aria-hidden className="size-4" />
          링크 새로 만들기
        </Button>
      ) : null}
    </section>
  );
}
