'use client';

import { useId, useState } from 'react';

import { useMutation } from '@apollo/client/react';
import dayjs from 'dayjs';

import { CreateGroupContestDocument, GroupContestsDocument } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { useZodForm } from '@/shared/model/form';
import { useAppRouter } from '@/shared/model/router';
import { toast } from '@/shared/model/toast';
import { BottomSheet, type IBottomSheetControlProps } from '@/shared/ui/@core/bottom-sheet';
import { Button } from '@/shared/ui/@core/button';
import { TextField } from '@/shared/ui/@core/text-field';

import {
  hasSubmissionWindow,
  startNowIfPast,
  SUBMISSION_END_PASSED_MESSAGE,
} from '../../lib/contest-schedule.helper';
import { buildContestDefaults, createGroupContestSchema } from '../../model/contest.schema';

export function CreateGroupContestBottomSheet({
  groupId,
  isOpen,
  onClose,
  unmount,
}: IBottomSheetControlProps & { groupId: string }) {
  const formId = useId();
  const [defaults] = useState(() => buildContestDefaults(dayjs().toDate()));
  const form = useZodForm(createGroupContestSchema, { defaultValues: { ...defaults, likeLimit: 1 } });
  const router = useAppRouter();
  const [create] = useMutation(CreateGroupContestDocument, {
    refetchQueries: [GroupContestsDocument],
    onCompleted: ({ createGroupContest }) => {
      toast.success('대회를 개최했어요');
      onClose();
      router.push(ROUTES.GROUP_CONTEST(groupId, createGroupContest.id));
    },
  });
  const { errors } = form.formState;
  return (
    <BottomSheet.Root isOpen={isOpen} onClose={onClose} unmount={unmount}>
      <BottomSheet.Header
        title="그룹 대회 개최"
        description="멤버들이 사진이나 동영상을 올려 참여해요. 접수가 끝나면 한 사람당 한 작품에 투표할 수 있어요. 득표수가 같으면 공동 우승이에요."
      />
      <BottomSheet.Content>
        <form
          id={formId}
          noValidate
          className="mx-auto flex w-full max-w-app flex-col gap-5"
          onSubmit={form.handleSubmit(async (values) => {
            const schedule = startNowIfPast(values);
            if (!hasSubmissionWindow(schedule)) {
              form.setError(
                'submissionEndsAt',
                { message: SUBMISSION_END_PASSED_MESSAGE },
                { shouldFocus: true },
              );
              return;
            }
            try {
              await create({ variables: { groupId, ...schedule } });
            } catch {
              /* ErrorLink가 알린다. */
            }
          })}
        >
          <TextField
            required
            label="대회 제목"
            maxLength={80}
            error={errors.title?.message}
            {...form.register('title')}
          />
          <TextField
            required
            type="number"
            label="1인당 좋아요 한도"
            min={1}
            max={100}
            step={1}
            description="이 대회에서 한 사람이 좋아요를 남길 수 있는 작품 수예요. 기본값은 1개이며, 취소하면 다른 작품을 선택할 수 있어요. 대회 투표와는 별개입니다."
            error={errors.likeLimit?.message}
            {...form.register('likeLimit', { valueAsNumber: true })}
          />
          <TextField
            required
            type="datetime-local"
            label="시작 시각"
            error={errors.startsAt?.message}
            {...form.register('startsAt')}
          />
          <TextField
            required
            type="datetime-local"
            label="게시물 접수 마감"
            error={errors.submissionEndsAt?.message}
            {...form.register('submissionEndsAt')}
          />
          <TextField
            required
            type="datetime-local"
            label="투표 마감"
            description="대회는 최대 90일 동안 진행할 수 있어요. 입력 시각은 기기의 시간대 기준입니다."
            error={errors.endsAt?.message}
            {...form.register('endsAt')}
          />
        </form>
      </BottomSheet.Content>
      <BottomSheet.Footer>
        <Button type="submit" form={formId} fullWidth loading={form.formState.isSubmitting}>
          대회 개최하기
        </Button>
      </BottomSheet.Footer>
    </BottomSheet.Root>
  );
}
