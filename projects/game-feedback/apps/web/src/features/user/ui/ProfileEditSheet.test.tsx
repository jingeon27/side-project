import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, type PublicProfile } from '@/shared/api';

import { ProfileEditSheet } from './ProfileEditSheet';

const state = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  uploadAvatar: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: state.refresh }) }));
vi.mock('@game-feedback/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@game-feedback/sdk')>()),
  updateProfile: state.updateProfile,
}));
vi.mock('@/features/user/api/avatar.api', () => ({ uploadAvatar: state.uploadAvatar }));
vi.mock('@/features/user/api/user.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/user/api/user.api')>()),
  fetchPublicProfile: async () => profile,
}));

const profile: PublicProfile = {
  author: {
    id: 'me',
    nickname: '원래닉네임',
    isVerified: false,
    supercellTag: null,
    isTestAccount: false,
    avatarUrl: null,
  },
  bio: '',
  links: [],
  joinedAt: '2026-10-20T00:00:00Z',
  postCount: 0,
  answerCount: 0,
  helpfulCount: 0,
};

function renderSheet() {
  const onOpenChange = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ProfileEditSheet open onOpenChange={onOpenChange} profile={profile} />
    </QueryClientProvider>,
  );
  return onOpenChange;
}

function choosePhoto() {
  const photo = screen.getByRole('form', { name: '프로필 사진 편집' });
  fireEvent.change(within(photo).getByLabelText('프로필 사진 선택'), {
    target: { files: [new File(['photo'], 'me.png', { type: 'image/png' })] },
  });
  return photo;
}

function addLinkDraft() {
  const links = screen.getByRole('form', { name: '프로필 링크 편집' });
  fireEvent.click(within(links).getByRole('button', { name: '링크 추가' }));
  fireEvent.change(within(links).getByRole('textbox', { name: /이름/ }), { target: { value: '나의 방송' } });
  return links;
}

beforeEach(() => {
  state.updateProfile.mockReset();
  state.uploadAvatar.mockReset();
  state.refresh.mockReset();
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

describe('profile edit sheet', () => {
  it('saves the profile details without closing or dropping photo and link drafts', async () => {
    state.updateProfile.mockImplementation(async (input: { nickname: string; bio: string }) => ({
      ...profile,
      author: { ...profile.author, nickname: input.nickname },
      bio: input.bio,
    }));
    const onOpenChange = renderSheet();
    const photo = choosePhoto();
    const links = addLinkDraft();
    const details = screen.getByRole('form', { name: '프로필 수정' });
    fireEvent.change(within(details).getByRole('textbox', { name: '서비스 닉네임' }), {
      target: { value: '새닉네임' },
    });

    fireEvent.click(within(details).getByRole('button', { name: '프로필 저장' }));

    await waitFor(() => expect(state.updateProfile).toHaveBeenCalledWith({ nickname: '새닉네임', bio: '' }));
    await waitFor(() => expect(state.refresh).toHaveBeenCalledOnce());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(within(photo).getByRole('img', { name: '선택한 프로필 사진 미리보기' })).toBeTruthy();
    expect(within(links).getByRole('textbox', { name: /이름/ })).toHaveProperty('value', '나의 방송');
  });

  it('asks before discarding unsaved drafts when the sheet is closed', () => {
    const onOpenChange = renderSheet();
    const photo = choosePhoto();

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(
      '저장하지 않은 변경이 있어요. 닫으면 입력한 내용이 사라져요.',
    );
    fireEvent.click(screen.getByRole('button', { name: '계속 편집' }));
    expect(within(photo).getByRole('img', { name: '선택한 프로필 사진 미리보기' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    fireEvent.click(screen.getByRole('button', { name: '저장하지 않고 닫기' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes right away when nothing is left unsaved', () => {
    const onOpenChange = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps the sheet open while a photo upload is pending and shows its failure as an error notice', async () => {
    const upload = Promise.withResolvers<PublicProfile>();
    state.uploadAvatar.mockReturnValueOnce(upload.promise);
    const onOpenChange = renderSheet();
    const photo = choosePhoto();
    fireEvent.click(within(photo).getByRole('button', { name: '사진 저장' }));
    await waitFor(() => expect(state.uploadAvatar).toHaveBeenCalledOnce());

    expect(screen.getByRole<HTMLButtonElement>('button', { name: '닫기' }).disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole('dialog', { name: '프로필 수정' }), { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();

    await act(async () =>
      upload.reject(
        new ApiError(400, 'INVALID_AVATAR', '사진을 읽을 수 없습니다. 다른 사진을 선택해주세요.'),
      ),
    );
    const notice = await within(photo).findByRole('alert');
    expect(notice.className).toBe('error-notice');
    expect(notice.textContent).toBe('사진을 읽을 수 없습니다. 다른 사진을 선택해주세요.');
    expect(within(photo).getByRole('img', { name: '선택한 프로필 사진 미리보기' })).toBeTruthy();
  });
});
