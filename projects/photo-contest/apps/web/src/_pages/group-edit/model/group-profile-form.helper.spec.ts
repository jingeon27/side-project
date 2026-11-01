import { describe, expect, it } from 'vitest';

import { groupProfileSchema } from '@/features/group';

import { getGroupProfileDefaults, toGroupProfileVariables } from './group-profile-form.helper';

describe('그룹 프로필 폼 변환', () => {
  it('서버 이름·소개만 초기값으로 옮기고 사진 두 칸과 삭제 의사는 명시적으로 초기화해야 한다', () => {
    expect(getGroupProfileDefaults({ name: '그룹', description: '소개' })).toEqual({
      completedImages: {},
      name: '그룹',
      description: '소개',
      avatar: null,
      cover: null,
      removeAvatar: false,
      removeCover: false,
    });
  });
  it('검증된 텍스트·사진 유지/삭제 의사·완료 ID만 전송하고 File은 제외해야 한다', () => {
    const file = new File(['photo'], 'photo.png', { type: 'image/png' });
    const values = groupProfileSchema.parse({
      name: ' 그룹 ',
      description: ' 소개 ',
      avatar: file,
      completedImages: {
        avatar: { file, groupId: 'group-1', id: 'uploaded-1', expiresAt: '2026-10-31T00:00:00.000Z' },
      },
      removeAvatar: false,
      cover: null,
      removeCover: true,
    });
    expect(toGroupProfileVariables('group-1', values, { avatarId: 'uploaded-1' })).toEqual({
      groupId: 'group-1',
      name: '그룹',
      description: '소개',
      removeAvatar: false,
      removeCover: true,
      avatarId: 'uploaded-1',
      coverId: undefined,
    });
    expect(
      toGroupProfileVariables(
        'group-1',
        groupProfileSchema.parse(getGroupProfileDefaults({ name: '그룹', description: '' })),
        {},
      ),
    ).toMatchObject({ removeAvatar: false, removeCover: false, avatarId: undefined, coverId: undefined });
  });
});
