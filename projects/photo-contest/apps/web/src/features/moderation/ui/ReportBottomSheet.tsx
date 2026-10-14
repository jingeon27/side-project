'use client';

import { useMutation } from '@apollo/client/react';

import { ReportSubmissionDocument } from '@/shared/api/generated';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { useZodForm } from '@/shared/model/form';
import { toast } from '@/shared/model/toast';
import { BottomSheet } from '@/shared/ui/@core/bottom-sheet';
import type { IBottomSheetControlProps } from '@/shared/ui/@core/bottom-sheet';
import { Button } from '@/shared/ui/@core/button';
import { TextArea } from '@/shared/ui/@core/text-field';

import { reportSchema } from '../model/moderation.schema';

const FORM_ID = 'report-submission-form';

interface IReportBottomSheetProps extends IBottomSheetControlProps {
  contestId: string;
  submissionId: string;
}

/** 일반 멤버의 사진 신고. 같은 사람의 중복 신고는 서버가 한 건으로 남긴다. */
export function ReportBottomSheet({ contestId, submissionId, isOpen, onClose, unmount }: IReportBottomSheetProps) {
  const form = useZodForm(reportSchema, { defaultValues: { reason: '' } });
  const [reportSubmission, { loading }] = useMutation(ReportSubmissionDocument, {
    onCompleted: () => {
      trackEvent(ANALYTICS_EVENT.PhotoReported, { contest_id: contestId });
      toast.success('신고를 접수했어요', { description: '그룹 관리자가 확인할게요.' });
      onClose();
    },
  });

  const handleSubmit = form.handleSubmit(async ({ reason }) => {
    try {
      await reportSubmission({ variables: { submissionId, reason } });
    } catch {
      // 실패는 ErrorLink가 토스트로 알린다.
    }
  });

  return (
    <BottomSheet.Root isOpen={isOpen} onClose={onClose} unmount={unmount}>
      <BottomSheet.Header title="사진 신고하기" description="신고 내용은 그룹 관리자만 확인할 수 있어요." />
      <BottomSheet.Content>
        <form id={FORM_ID} onSubmit={handleSubmit} noValidate>
          <TextArea
            label="신고 이유"
            placeholder="예: 동의 없이 올린 사진이에요."
            maxLength={500}
            error={form.formState.errors.reason?.message}
            {...form.register('reason')}
          />
        </form>
      </BottomSheet.Content>
      <BottomSheet.Footer>
        <Button type="submit" form={FORM_ID} variant="danger" size="lg" fullWidth loading={loading}>
          신고 제출
        </Button>
      </BottomSheet.Footer>
    </BottomSheet.Root>
  );
}
