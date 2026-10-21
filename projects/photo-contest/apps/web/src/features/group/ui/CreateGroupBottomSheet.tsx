'use client';

import { useMutation } from '@apollo/client/react';

import { CreateGroupDocument, GroupVisibility } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { useZodForm } from '@/shared/model/form';
import { useAppRouter } from '@/shared/model/router';
import { BottomSheet, type IBottomSheetControlProps } from '@/shared/ui/@core/bottom-sheet';
import { Button } from '@/shared/ui/@core/button';
import { TextArea, TextField } from '@/shared/ui/@core/text-field';

import { prependMyGroup } from '../model/group.cache';
import { createGroupSchema } from '../model/group.schema';
import { GroupVisibilityField } from './GroupVisibilityField';

const FORM_ID = 'create-group-form';

/** 그룹 만들기. 만들면 홈 목록에 넣고 새 그룹 화면으로 간다. 실패는 공통 토스트가 알린다. */
export function CreateGroupBottomSheet({ isOpen, onClose, unmount }: IBottomSheetControlProps) {
  const router = useAppRouter();
  const form = useZodForm(createGroupSchema, {
    defaultValues: { name: '', description: '', visibility: GroupVisibility.Public },
  });
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

  return (
    <BottomSheet.Root isOpen={isOpen} onClose={onClose} unmount={unmount}>
      <BottomSheet.Header
        title="그룹 만들기"
        description="공개 범위를 정하고 사진과 동영상으로 웃긴 순간을 나눠보세요."
      />
      <BottomSheet.Content>
        <form
          id={FORM_ID}
          className="flex flex-col gap-6"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              await createGroup({ variables: values });
            } catch {
              // 실패는 ErrorLink가 토스트로 알린다. 입력을 고쳐 다시 시도할 수 있게 시트를 열어 둔다.
            }
          })}
          noValidate
        >
          <TextField
            required
            label="그룹 이름"
            placeholder="예: 웃음 참기 연구소"
            autoComplete="off"
            enterKeyHint="done"
            error={form.formState.errors.name?.message}
            {...form.register('name')}
          />
          <TextArea
            label="그룹 소개"
            maxLength={500}
            rows={3}
            placeholder="어떤 순간을 함께 나눌까요?"
            error={form.formState.errors.description?.message}
            {...form.register('description')}
          />
          <GroupVisibilityField form={form} />
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
