'use client';

import { useMutation } from '@apollo/client/react';

import { CreateGroupDocument } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { useZodForm } from '@/shared/model/form';
import { useAppRouter } from '@/shared/model/router';
import { BottomSheet } from '@/shared/ui/@core/bottom-sheet';
import type { IBottomSheetControlProps } from '@/shared/ui/@core/bottom-sheet';
import { Button } from '@/shared/ui/@core/button';
import { TextField } from '@/shared/ui/@core/text-field';

import { prependMyGroup } from '../model/group.cache';
import { createGroupSchema } from '../model/group.schema';

const FORM_ID = 'create-group-form';

/** 그룹 만들기. 만들면 홈 목록에 넣고 새 그룹 화면으로 간다. 실패는 공통 토스트가 알린다. */
export function CreateGroupBottomSheet({ isOpen, onClose, unmount }: IBottomSheetControlProps) {
  const router = useAppRouter();
  const form = useZodForm(createGroupSchema, { defaultValues: { name: '' } });
  const [createGroup, { loading }] = useMutation(CreateGroupDocument, {
    update: (cache, { data }) => {
      if (data) prependMyGroup(cache, data.createGroup);
    },
    onCompleted: ({ createGroup: group }) => {
      trackEvent(ANALYTICS_EVENT.GroupCreated, { group_id: group.id });
      // 시트가 쌓은 기록 위에서 이동해야 뒤로 가기가 빈 시트 항목으로 돌아오지 않는다.
      router.push(ROUTES.GROUP(group.id));
      onClose();
    },
  });

  const handleSubmit = form.handleSubmit(async ({ name }) => {
    try {
      await createGroup({ variables: { name } });
    } catch {
      // 실패는 ErrorLink가 토스트로 알린다. 입력을 고쳐 다시 시도할 수 있게 시트를 열어 둔다.
    }
  });

  return (
    <BottomSheet.Root isOpen={isOpen} onClose={onClose} unmount={unmount}>
      <BottomSheet.Header title="우리만의 그룹 만들기" description="친구를 초대하고 첫 사진 대회를 열어보세요." />
      <BottomSheet.Content>
        <form id={FORM_ID} onSubmit={handleSubmit} noValidate>
          <TextField
            label="그룹 이름"
            placeholder="예: 웃음 참기 연구소"
            autoComplete="off"
            enterKeyHint="done"
            error={form.formState.errors.name?.message}
            {...form.register('name')}
          />
        </form>
      </BottomSheet.Content>
      <BottomSheet.Footer>
        <Button type="submit" form={FORM_ID} fullWidth loading={loading}>
          그룹 만들기
        </Button>
      </BottomSheet.Footer>
    </BottomSheet.Root>
  );
}
