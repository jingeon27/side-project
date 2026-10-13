'use client';
import Image from 'next/image';
import { useMutation } from '@apollo/client/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { Check, Flag, EyeOff, Trash2, Trophy } from 'lucide-react';
import {
  CastVoteDocument,
  DeletePhotoDocument,
  HidePhotoDocument,
  Phase,
  PhotoFragment,
  ReportPhotoDocument,
} from '@/shared/api/generated';
import { Button } from '@/shared/ui/button';
import { Modal } from '@/shared/ui/dialog';
import { ErrorNotice } from '@/shared/ui/states';
import { errorMessage } from '@/shared/lib/format';
const schema = z.object({
  reason: z.string().trim().min(1, '신고 이유를 입력해 주세요.').max(500, '500자 이내로 입력해 주세요.'),
});
export function PhotoCard({
  photo,
  contestId,
  phase,
  myVoteId,
  userId,
  admin,
  winner = false,
}: {
  photo: PhotoFragment;
  contestId: string;
  phase: Phase;
  myVoteId?: string | null;
  userId: string;
  admin: boolean;
  winner?: boolean;
}) {
  const [error, setError] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [vote, voteState] = useMutation(CastVoteDocument);
  const [hide, hideState] = useMutation(HidePhotoDocument);
  const [remove, deleteState] = useMutation(DeletePhotoDocument);
  const [report] = useMutation(ReportPhotoDocument);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { reason: '' },
  });
  const refetchQueries = ['Contest', 'MorePhotos', 'Results'];
  async function handleVote() {
    setError('');
    try {
      await vote({
        variables: { contestId, submissionId: photo.id },
        optimisticResponse: {
          castVote: { __typename: 'Vote', id: `pending-${photo.id}`, contestId, submissionId: photo.id },
        },
        update(cache, { data }) {
          if (data)
            cache.modify({
              id: cache.identify({ __typename: 'Contest', id: contestId }),
              fields: {
                myVoteId() {
                  return data.castVote.submissionId;
                },
              },
            });
        },
      });
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  async function handleHide() {
    setError('');
    try {
      await hide({ variables: { submissionId: photo.id }, refetchQueries });
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  async function handleDelete() {
    setError('');
    try {
      await remove({ variables: { submissionId: photo.id }, refetchQueries });
      setDeleteOpen(false);
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  async function handleReport(values: z.infer<typeof schema>) {
    setError('');
    try {
      await report({ variables: { submissionId: photo.id, reason: values.reason }, refetchQueries });
      setReportOpen(false);
      setReported(true);
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  const selected = myVoteId === photo.id;
  return (
    <article className={`photo-card ${winner ? 'winner-card' : ''} ${photo.hidden ? 'hidden-card' : ''}`}>
      <div className="photo-image">
        {/* Cookie-authenticated private images must bypass the public optimization proxy. */}
        <Image
          src={photo.imageUrl}
          alt={photo.caption}
          fill
          unoptimized
          sizes="(max-width: 600px) 100vw, (max-width: 850px) 50vw, 33vw"
        />
        {winner && (
          <span className="winner-badge">
            <Trophy size={15} />
            우승작
          </span>
        )}
        {photo.hidden && <span className="hidden-badge">숨겨진 사진</span>}
      </div>
      <div className="photo-body">
        <h3>{photo.caption}</h3>
        <p className="muted small">
          {photo.author.nickname}
          {photo.author.id === userId && ' · 내 사진'}
        </p>
        {phase === Phase.Completed && (
          <p className="vote-count">
            {photo.voteCount ?? 0}
            <span>표</span>
          </p>
        )}
        {phase === Phase.Voting && (
          <Button
            className="full-width"
            variant={selected ? 'primary' : 'secondary'}
            disabled={voteState.loading || Boolean(myVoteId) || photo.author.id === userId || photo.hidden}
            onClick={handleVote}
          >
            {selected ? (
              <>
                <Check size={17} />
                내가 뽑은 사진
              </>
            ) : photo.author.id === userId ? (
              '내 사진에는 투표할 수 없어요'
            ) : myVoteId ? (
              '투표 완료'
            ) : (
              '이 사진에 한 표!'
            )}
          </Button>
        )}
        <div className="photo-actions">
          {!photo.hidden && (
            <Modal
              title="사진 신고하기"
              description="신고 내용은 그룹 관리자만 확인할 수 있어요."
              trigger={
                <>
                  <Flag size={13} />
                  {reported ? '신고 완료' : '신고'}
                </>
              }
              open={reportOpen}
              onOpenChange={setReportOpen}
            >
              <form className="form" onSubmit={form.handleSubmit(handleReport)}>
                <label htmlFor={`reason-${photo.id}`}>
                  신고 이유
                  <textarea id={`reason-${photo.id}`} {...form.register('reason')} />
                </label>
                {form.formState.errors.reason && (
                  <p className="field-error" role="alert">
                    {form.formState.errors.reason.message}
                  </p>
                )}
                {error && <ErrorNotice message={error} />}
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  신고 제출
                </Button>
              </form>
            </Modal>
          )}
          {admin && (
            <>
              {Boolean(photo.reportCount) && <span className="report-count">신고 {photo.reportCount}건</span>}
              {!photo.hidden && (
                <Button variant="ghost" disabled={hideState.loading} onClick={handleHide}>
                  <EyeOff size={13} />
                  숨기기
                </Button>
              )}
              <Modal
                title="사진을 삭제할까요?"
                description="사진과 연결된 투표·신고가 삭제됩니다. 복구할 수 없습니다."
                trigger={
                  <>
                    <Trash2 size={13} />
                    삭제
                  </>
                }
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
              >
                <div className="form">
                  {error && <ErrorNotice message={error} />}
                  <Button variant="danger" disabled={deleteState.loading} onClick={handleDelete}>
                    사진 삭제하기
                  </Button>
                </div>
              </Modal>
            </>
          )}
        </div>
        {admin && Boolean(photo.reports?.length) && (
          <details className="report-details">
            <summary>신고 내용 확인</summary>
            {photo.reports?.map((report) => (
              <p key={report.id}>{report.reason}</p>
            ))}
          </details>
        )}
        {reported && (
          <p className="small" role="status">
            신고를 접수했어요.
          </p>
        )}
        {error && !reportOpen && !deleteOpen && <ErrorNotice message={error} />}
      </div>
    </article>
  );
}
