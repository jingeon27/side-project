import dayjs from 'dayjs';
import { afterEach, expect, it, vi } from 'vitest';

import { uploadGroupImages } from './upload-group-images';

type TOptions = Parameters<typeof uploadGroupImages>[0];

function createOptions() {
  const avatar = new File(['avatar'], 'avatar.png', { type: 'image/png' });
  const cover = new File(['cover'], 'cover.png', { type: 'image/png' });
  return {
    groupId: 'group-1',
    images: { avatar, cover },
    completedImages: {},
    onCompleted: vi.fn<TOptions['onCompleted']>(),
    request: vi.fn(async (file: File) => ({
      __typename: 'UploadTicket' as const,
      id: file.name,
      url: 'https://storage.invalid/group-photo',
      fields: [],
      expiresAt: dayjs().add(5, 'minute').toISOString(),
    })),
    complete: vi.fn(async (id: string) => id),
    signal: new AbortController().signal,
  } satisfies TOptions;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it('같은 그룹과 같은 파일의 유효한 완료 ID는 티켓을 다시 발급하지 않고 재사용한다', async () => {
  const options = createOptions();
  const completed = {
    groupId: options.groupId,
    file: options.images.avatar,
    id: 'completed-avatar',
    expiresAt: dayjs().add(1, 'minute').toISOString(),
  };
  expect(
    await uploadGroupImages({
      ...options,
      images: { avatar: completed.file },
      completedImages: { avatar: completed },
    }),
  ).toEqual({ avatarId: completed.id, coverId: undefined });
  expect(options.request).not.toHaveBeenCalled();
  expect(options.complete).not.toHaveBeenCalled();
});

it.each(['파일 변경', '그룹 변경', '재사용 기한 만료'] as const)(
  '%s이면 완료 ID를 재사용하지 않는다',
  async (reason) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    const options = createOptions();
    const completed = {
      groupId: reason === '그룹 변경' ? 'other-group' : options.groupId,
      file:
        reason === '파일 변경'
          ? new File(['other'], 'avatar.png', { type: 'image/png' })
          : options.images.avatar,
      id: 'old-avatar',
      expiresAt: dayjs()
        .add(reason === '재사용 기한 만료' ? -1 : 1, 'minute')
        .toISOString(),
    };
    const result = await uploadGroupImages({
      ...options,
      images: { avatar: options.images.avatar },
      completedImages: { avatar: completed },
    });
    expect(result.avatarId).toBe('avatar.png');
    expect(options.request).toHaveBeenCalledOnce();
    expect(options.onCompleted).toHaveBeenCalledWith(
      'avatar',
      expect.objectContaining({ file: options.images.avatar, id: 'avatar.png' }),
    );
  },
);

it('사진을 지우면 이전 완료 ID를 프로필에 다시 연결하지 않는다', async () => {
  const options = createOptions();
  const completed = {
    groupId: options.groupId,
    file: options.images.avatar,
    id: 'old-avatar',
    expiresAt: dayjs().add(1, 'minute').toISOString(),
  };
  expect(
    await uploadGroupImages({
      ...options,
      images: { avatar: null, cover: null },
      completedImages: { avatar: completed },
    }),
  ).toEqual({ avatarId: undefined, coverId: undefined });
  expect(options.request).not.toHaveBeenCalled();
});

it('완료 확인이 거절된 사진은 완료 초안에 넣지 않고 성공한 사진만 보존한다', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 204 })),
  );
  const options = createOptions();
  const rejected = new Error('완료 확인 거절');
  const complete = vi.fn(async (id: string) => {
    if (id === 'cover.png') throw rejected;
    return id;
  });
  await expect(uploadGroupImages({ ...options, complete })).rejects.toBe(rejected);
  expect(options.onCompleted).toHaveBeenCalledOnce();
  expect(options.onCompleted).toHaveBeenCalledWith('avatar', expect.objectContaining({ id: 'avatar.png' }));
});

it('이미 닫힌 제출은 새 티켓을 요청하거나 완료 초안을 갱신하지 않는다', async () => {
  const controller = new AbortController();
  controller.abort();
  const options = createOptions();
  await expect(uploadGroupImages({ ...options, signal: controller.signal })).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(options.request).not.toHaveBeenCalled();
  expect(options.onCompleted).not.toHaveBeenCalled();
});
