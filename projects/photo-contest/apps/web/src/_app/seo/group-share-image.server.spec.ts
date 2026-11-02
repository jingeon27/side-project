import { readFile } from 'node:fs/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GroupVisibility } from '@/shared/api/generated';

import { createGroupShareImage } from './group-share-image.server';

const mocks = vi.hoisted(() => ({ group: vi.fn(), contest: vi.fn(), render: vi.fn(), image: vi.fn() }));
vi.mock('@/_pages/group/index.server', () => ({ getGroupSeoData: mocks.group }));
vi.mock('@/_pages/group-contest/index.server', () => ({ getGroupContestSeoData: mocks.contest }));
vi.mock('@side/design-system/og', () => ({
  createSocialPreview: mocks.render,
  readSocialPreviewImage: mocks.image,
}));
afterEach(() => vi.resetAllMocks());

const group = {
  id: 'group-1',
  name: '우리의 순간들',
  description: '같이 나눌 사진',
  visibility: GroupVisibility.Public,
  memberCount: 3,
  avatarUrl: null,
  coverUrl: null,
};

describe('public group image authorization', () => {
  it('renders a real public group and prefers its cover over member photos', async () => {
    mocks.group.mockResolvedValue({
      group: { ...group, coverUrl: '/backend/groups/group-1/cover/cover-1' },
      posts: [],
    });
    mocks.image.mockResolvedValue('data:image/png;base64,AQID');
    mocks.render.mockResolvedValue(new Response());
    await createGroupShareImage('group-1');
    expect(mocks.render.mock.calls[0]?.[0]).toMatchObject({
      title: group.name,
      description: group.description,
      image: 'data:image/png;base64,AQID',
    });
    expect(String(mocks.image.mock.calls[0]?.[0])).toContain('/groups/group-1/cover/cover-1');
  });
  it('uses the identical brand fallback for private group and contest content without fetching media', async () => {
    const privateData = {
      group: {
        ...group,
        name: '공개하면 안 되는 그룹',
        visibility: GroupVisibility.Private,
        coverUrl: '/backend/groups/group-1/cover/secret',
      },
      posts: [],
      contest: { title: '비공개 대회' },
    };
    mocks.group.mockResolvedValue(privateData);
    mocks.contest.mockResolvedValue(privateData);
    const original = await readFile('public/brand/og-image.png');
    for (const contest of [undefined, 'contest-1']) {
      const response = await createGroupShareImage('group-1', contest);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(original);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(mocks.render).not.toHaveBeenCalled();
    expect(mocks.image).not.toHaveBeenCalled();
  });
  it('uses the brand fallback when a group does not exist', async () => {
    mocks.group.mockResolvedValue(null);
    const response = await createGroupShareImage('missing');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(await readFile('public/brand/og-image.png'));
    expect(mocks.render).not.toHaveBeenCalled();
  });
});
