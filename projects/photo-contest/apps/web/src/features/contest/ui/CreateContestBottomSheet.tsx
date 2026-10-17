'use client';

import { useMutation } from '@apollo/client/react';
import { useState } from 'react';

import { CreateContestDocument } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { useZodForm } from '@/shared/model/form';
import { useAppRouter } from '@/shared/model/router';
import { BottomSheet } from '@/shared/ui/@core/bottom-sheet';
import type { IBottomSheetControlProps } from '@/shared/ui/@core/bottom-sheet';
import { Button } from '@/shared/ui/@core/button';
import { TextField } from '@/shared/ui/@core/text-field';

import { prependGroupContest } from '../model/contest.cache';
import { buildContestDefaults, createContestSchema } from '../model/contest.schema';

const FORM_ID = 'create-contest-form';

interface ICreateContestBottomSheetProps extends IBottomSheetControlProps {
  groupId: string;
}

/** 관리자가 새 사진 대회를 연다. 열면 그룹 대회 목록에 넣고 대회 화면으로 간다. */
export function CreateContestBottomSheet({
  groupId,
  isOpen,
  onClose,
  unmount,
}: ICreateContestBottomSheetProps) {
  const router = useAppRouter();
  // 시트를 열 때마다 새로 그려지므로 그때 시각으로 기본값을 한 번 정한다.
  const [defaultValues] = useState(() => buildContestDefaults(new Date()));
  const form = useZodForm(createContestSchema, { defaultValues });
  const [createContest, { loading }] = useMutation(CreateContestDocument, {
    update: (cache, { data }) => {
      if (data) prependGroupContest(cache, groupId, data.createContest);
    },
    onCompleted: ({ createContest: contest }) => {
      trackEvent(ANALYTICS_EVENT.ContestCreated, { group_id: groupId, contest_id: contest.id });
      router.push(ROUTES.CONTEST(contest.id));
      onClose();
    },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      await createContest({ variables: { groupId, ...values } });
    } catch {
      // 실패는 ErrorLink가 토스트로 알린다.
    }
  });

  const { errors } = form.formState;
  return (
    <BottomSheet.Root isOpen={isOpen} onClose={onClose} unmount={unmount}>
      <BottomSheet.Header
        title="새 사진 대회 열기"
        description="제출 기간이 끝나면 투표가 자동으로 시작돼요."
      />
      <BottomSheet.Content>
        <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <TextField
            required
            label="대회 제목"
            placeholder="이번 주 가장 웃긴 순간"
            autoComplete="off"
            error={errors.title?.message}
            {...form.register('title')}
          />
          <TextField
            required
            label="시작 시각"
            type="datetime-local"
            error={errors.startsAt?.message}
            {...form.register('startsAt')}
          />
          <TextField
            required
            label="사진 제출 마감"
            type="datetime-local"
            error={errors.submissionEndsAt?.message}
            {...form.register('submissionEndsAt')}
          />
          <TextField
            required
            label="투표 마감"
            type="datetime-local"
            description="입력 시각은 기기의 시간대 기준이에요. 대회는 최대 90일 동안 진행할 수 있어요."
            error={errors.endsAt?.message}
            {...form.register('endsAt')}
          />
        </form>
      </BottomSheet.Content>
      <BottomSheet.Footer>
        <Button type="submit" form={FORM_ID} fullWidth loading={loading}>
          대회 열기
        </Button>
      </BottomSheet.Footer>
    </BottomSheet.Root>
  );
}
