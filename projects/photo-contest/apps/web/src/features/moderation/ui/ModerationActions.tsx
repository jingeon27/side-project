'use client';

import { useMutation } from '@apollo/client/react';
import { EyeOff, Flag, Trash2 } from 'lucide-react';
import { overlay } from 'overlay-kit';

import {
  DeleteSubmissionDocument,
  HideSubmissionDocument,
  type SubmissionCardFragment,
} from '@/shared/api/generated';
import { formatDateTime } from '@/shared/lib/format.helper';
import { toast } from '@/shared/model/toast';
import { Badge } from '@/shared/ui/@core/badge';
import { Button } from '@/shared/ui/@core/button';
import { ConfirmDialog } from '@/shared/ui/@core/confirm-dialog';

import { evictSubmission, markSubmissionHidden, moderationRefetchQueries } from '../model/moderation.cache';
import { ReportBottomSheet } from './ReportBottomSheet';

interface IModerationActionsProps {
  submission: Pick<SubmissionCardFragment, 'id' | 'hidden' | 'reportCount' | 'reports'>;
  contestId: string;
  /** 그룹 관리자: 신고 내용 보기·숨기기·삭제 */
  isAdmin: boolean;
  /** 내 사진은 신고하지 않는다. */
  isMine: boolean;
  isCompleted: boolean;
}

/** 사진 카드 아래 관리 줄. 관리자에게는 신고 수·내용과 숨기기·삭제를, 일반 멤버에게는 신고를 보여 준다. */
export function ModerationActions({
  submission,
  contestId,
  isAdmin,
  isMine,
  isCompleted,
}: IModerationActionsProps) {
  const refetchQueries = moderationRefetchQueries(contestId, isCompleted);
  const [hideSubmission, hideState] = useMutation(HideSubmissionDocument, {
    variables: { submissionId: submission.id },
    update: (cache) => markSubmissionHidden(cache, submission.id),
    refetchQueries,
    onCompleted: () =>
      toast.success('사진을 숨겼어요', { description: '숨긴 사진 관리에서 확인할 수 있어요.' }),
  });
  const [deleteSubmission] = useMutation(DeleteSubmissionDocument, {
    variables: { submissionId: submission.id },
    update: (cache) => evictSubmission(cache, submission.id),
    refetchQueries,
    onCompleted: () => toast.success('사진을 삭제했어요'),
  });

  const handleHide = async () => {
    try {
      await hideSubmission();
    } catch {
      // 실패는 ErrorLink가 토스트로 알린다.
    }
  };

  const handleReport = () =>
    overlay.open(({ isOpen, close: onClose, unmount }) => (
      <ReportBottomSheet
        contestId={contestId}
        submissionId={submission.id}
        isOpen={isOpen}
        onClose={onClose}
        unmount={unmount}
      />
    ));

  const handleDelete = () =>
    overlay.open(({ isOpen, close: onClose, unmount }) => (
      <ConfirmDialog
        isOpen={isOpen}
        onClose={onClose}
        unmount={unmount}
        tone="danger"
        title="사진을 삭제할까요?"
        description="사진과 연결된 투표·좋아요·신고가 함께 삭제돼요. 되돌릴 수 없어요."
        confirmLabel="사진 삭제하기"
        onConfirm={() => deleteSubmission()}
      />
    ));

  if (!isAdmin) {
    if (isMine || submission.hidden) return null;
    return (
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" className="text-muted" onClick={handleReport}>
          <Flag aria-hidden className="size-4" />
          신고
        </Button>
      </div>
    );
  }

  const reports = submission.reports ?? [];
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-2">
        {submission.reportCount ? <Badge tone="danger">신고 {submission.reportCount}건</Badge> : null}
        <span className="flex-1" />
        {submission.hidden ? null : (
          <Button variant="ghost" size="sm" loading={hideState.loading} onClick={handleHide}>
            <EyeOff aria-hidden className="size-4" />
            숨기기
          </Button>
        )}
        <Button variant="ghost" size="sm" className="text-danger" onClick={handleDelete}>
          <Trash2 aria-hidden className="size-4" />
          삭제
        </Button>
      </div>
      {reports.length > 0 ? (
        <details className="rounded-control bg-sunken px-3 py-2 text-caption text-ink">
          <summary className="min-h-touch cursor-pointer content-center text-label">신고 내용 확인</summary>
          <ul className="flex flex-col gap-2 pb-2">
            {reports.map((report) => (
              <li key={report.id} className="flex flex-col">
                <span className="break-words">{report.reason}</span>
                <span className="text-micro text-muted">{formatDateTime(report.createdAt)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
