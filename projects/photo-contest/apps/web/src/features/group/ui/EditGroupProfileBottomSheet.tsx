'use client';

import { useBackgroundQuery, useMutation, useReadQuery, type QueryRef } from '@apollo/client/react';
import { useId } from 'react';
import {
  DiscoverGroupsDocument,
  GalleryDocument,
  GroupProfileDocument,
  MyGroupsDocument,
  UpdateGroupProfileDocument,
  UploadGroupAvatarDocument,
  type GroupProfileQuery,
} from '@/shared/api/generated';
import { useZodForm } from '@/shared/model/form';
import { toast } from '@/shared/model/toast';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { BottomSheet, type IBottomSheetControlProps } from '@/shared/ui/@core/bottom-sheet';
import { Button } from '@/shared/ui/@core/button';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TextArea, TextField } from '@/shared/ui/@core/text-field';
import { groupProfileSchema } from '../model/group-profile.schema';
import { GroupAvatarField } from './GroupAvatarField';

function ProfileForm({ queryRef, onClose }: { queryRef: QueryRef<GroupProfileQuery>; onClose: () => void }) {
  const { data } = useReadQuery(queryRef);
  const group = data.group;
  const form = useZodForm(groupProfileSchema, {
    defaultValues: { name: group.name, description: group.description, avatar: null, removeAvatar: false },
  });
  const formId = useId();
  const [upload] = useMutation(UploadGroupAvatarDocument);
  const [save] = useMutation(UpdateGroupProfileDocument, {
    refetchQueries: [
      MyGroupsDocument,
      DiscoverGroupsDocument,
      { query: GalleryDocument, variables: { id: group.id } },
    ],
    awaitRefetchQueries: true,
  });
  const { errors, isSubmitting } = form.formState;
  return (
    <>
      <BottomSheet.Content>
        <form
          id={formId}
          noValidate
          className="mx-auto flex w-full max-w-app flex-col gap-6 py-3"
          onSubmit={form.handleSubmit(async ({ avatar, ...values }) => {
            try {
              const uploaded = avatar
                ? await upload({ variables: { groupId: group.id, file: avatar } })
                : null;
              await save({
                variables: { groupId: group.id, ...values, avatarId: uploaded?.data?.uploadGroupAvatar.id },
              });
              toast.success('그룹 프로필을 수정했어요');
              onClose();
            } catch {
              /* ErrorLink가 알리고 입력은 유지한다. */
            }
          })}
        >
          <GroupAvatarField form={form} currentUrl={group.avatarUrl} />
          <p className="text-caption text-muted">
            그룹 사진과 소개는 공개 범위와 관계없이 탐색 화면에서도 보여요.
          </p>
          <TextField
            label="그룹 이름"
            required
            maxLength={40}
            disabled={isSubmitting}
            error={errors.name?.message}
            {...form.register('name')}
          />
          <TextArea
            label="그룹 소개"
            rows={4}
            maxLength={500}
            disabled={isSubmitting}
            placeholder="어떤 순간을 함께 나눌까요?"
            error={errors.description?.message}
            {...form.register('description')}
          />
        </form>
      </BottomSheet.Content>
      <BottomSheet.Footer>
        <Button type="submit" form={formId} fullWidth loading={isSubmitting} className="mx-auto max-w-app">
          프로필 저장하기
        </Button>
      </BottomSheet.Footer>
    </>
  );
}

export function EditGroupProfileBottomSheet({
  groupId,
  ...controls
}: IBottomSheetControlProps & { groupId: string }) {
  const [queryRef, { refetch }] = useBackgroundQuery(GroupProfileDocument, {
    variables: { id: groupId },
    fetchPolicy: 'network-only',
  });
  return (
    <BottomSheet.Root {...controls}>
      <BottomSheet.Header title="그룹 프로필 수정" />
      <AsyncBoundary onRetry={refetch} fallback={<Skeleton className="mx-5 h-64" />}>
        <ProfileForm queryRef={queryRef} onClose={() => controls.onClose()} />
      </AsyncBoundary>
    </BottomSheet.Root>
  );
}
