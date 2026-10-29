import type { z } from 'zod';

import type { GroupProfileQuery, UpdateGroupProfileMutationVariables } from '@/shared/api/generated';

import type { groupProfileSchema, TGroupProfileInput } from './group-profile.schema';

export function getGroupProfileDefaults(
  group: Pick<GroupProfileQuery['group'], 'name' | 'description'>,
): TGroupProfileInput {
  return {
    name: group.name,
    description: group.description,
    avatar: null,
    removeAvatar: false,
    cover: null,
    removeCover: false,
  };
}

/** File과 사진 주소는 JSON 요청에 싣지 않고, 업로드를 완료한 ID와 삭제 의사만 전달한다. */
export function toGroupProfileVariables(
  groupId: string,
  values: z.output<typeof groupProfileSchema>,
  uploads: { avatarId?: string; coverId?: string },
): UpdateGroupProfileMutationVariables {
  return {
    groupId,
    name: values.name,
    description: values.description,
    removeAvatar: values.removeAvatar,
    removeCover: values.removeCover,
    avatarId: uploads.avatarId,
    coverId: uploads.coverId,
  };
}
