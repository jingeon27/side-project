'use client';

import { useId, useState } from 'react';

import { useMutation } from '@apollo/client/react';

import { CreateGroupContestDocument, GroupContestsDocument } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { useZodForm } from '@/shared/model/form';
import { useAppRouter } from '@/shared/model/router';
import { toast } from '@/shared/model/toast';
import { BottomSheet, type IBottomSheetControlProps } from '@/shared/ui/@core/bottom-sheet';
import { Button } from '@/shared/ui/@core/button';
import { TextField } from '@/shared/ui/@core/text-field';

import { buildContestDefaults, createContestSchema } from '../model/contest.schema';

export function CreateGroupContestBottomSheet({
  groupId,
  isOpen,
  onClose,
  unmount,
}: IBottomSheetControlProps & { groupId: string }) {
  const formId = useId();
  const [defaults] = useState(() => buildContestDefaults(new Date()));
  const form = useZodForm(createContestSchema, { defaultValues: defaults });
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
        description="멤버가 사진·동영상으로 참여하고, 접수 마감 뒤 대회당 한 표를 투표해요. 동점은 공동 우승입니다."
      />
      <BottomSheet.Content>
        <form
          id={formId}
          noValidate
          className="mx-auto flex w-full max-w-app flex-col gap-5"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              await create({ variables: { groupId, ...values } });
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
