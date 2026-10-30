import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, type PublicProfile } from '@/shared/api';
import { confirmNavigation, NavigationGuardProvider } from '@/shared/navigation';

import { ProfileEditForm } from './ProfileEditForm';

const state = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  uploadAvatar: vi.fn(),
  deleteAvatar: vi.fn(),
  fetchProfile: vi.fn(),
}));

vi.mock('@game-feedback/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@game-feedback/sdk')>()),
  updateProfile: state.updateProfile,
  deleteProfileAvatar: state.deleteAvatar,
}));
vi.mock('@/features/user/api/avatar.api', () => ({ uploadAvatar: state.uploadAvatar }));
vi.mock('@/features/user/api/user.api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchPublicProfile: state.fetchProfile,
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
  joinedAt: '2026-10-20T00:00:00Z',
  postCount: 0,
  answerCount: 0,
  helpfulCount: 0,
};

function renderForm(initialProfile = profile) {
  state.fetchProfile.mockResolvedValue(initialProfile);
  const onSaved = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <NavigationGuardProvider>
        <ProfileEditForm onSaved={onSaved} profile={initialProfile} />
      </NavigationGuardProvider>
    </QueryClientProvider>,
  );
  return onSaved;
}

function choosePhoto() {
  const file = new File(['photo'], 'me.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('프로필 사진 선택'), { target: { files: [file] } });
  return file;
}

function changeNickname() {
  fireEvent.change(screen.getByRole('textbox', { name: '서비스 닉네임' }), {
    target: { value: '새닉네임' },
  });
}

function save() {
  fireEvent.click(screen.getByRole('button', { name: '프로필 저장' }));
}

beforeEach(() => {
  state.updateProfile.mockReset().mockImplementation(async (input: { nickname: string; bio: string }) => ({
    ...profile,
    author: { ...profile.author, nickname: input.nickname },
    bio: input.bio,
  }));
  state.uploadAvatar.mockReset().mockResolvedValue(profile);
  state.deleteAvatar.mockReset().mockResolvedValue(profile);
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

describe('unified profile editing', () => {
  it.each(['unmount', 'discard'])(
    'stops the remaining save flow after %s during a request',
    async (action) => {
      const saved = Promise.withResolvers<PublicProfile>();
      state.updateProfile.mockReturnValueOnce(saved.promise);
      const onSaved = renderForm();
      changeNickname();
      choosePhoto();
      save();
      await waitFor(() => expect(state.updateProfile).toHaveBeenCalledOnce());
      if (action === 'unmount') cleanup();
      if (action === 'discard') {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        await act(async () => expect(confirmNavigation()).toBe(true));
      }
      await act(async () => saved.resolve(profile));
      expect(state.uploadAvatar).not.toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();
    },
  );

  it.each(['details', 'photo'])('confirms leaving with an unsaved %s draft', (section) => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderForm();
    expect(confirmNavigation()).toBe(true);
    if (section === 'details') changeNickname();
    if (section === 'photo') choosePhoto();
    expect(confirmNavigation()).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('discards every draft only after confirming departure', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderForm();
    changeNickname();
    choosePhoto();
    await act(async () => expect(confirmNavigation()).toBe(false));
    expect(screen.getByRole('textbox', { name: '서비스 닉네임' })).toHaveProperty('value', '새닉네임');
    expect(screen.getByRole('img', { name: '선택한 프로필 사진 미리보기' })).toBeTruthy();
    confirm.mockReturnValue(true);
    await act(async () => expect(confirmNavigation()).toBe(true));
    expect(screen.getByRole('textbox', { name: '서비스 닉네임' })).toHaveProperty('value', '원래닉네임');
    expect(screen.queryByRole('img', { name: '선택한 프로필 사진 미리보기' })).toBeNull();
    expect(confirmNavigation()).toBe(true);
  });

  it('saves details and the photo with one action, locks inputs and only leaves after both succeed', async () => {
    const upload = Promise.withResolvers<PublicProfile>();
    state.uploadAvatar.mockReturnValueOnce(upload.promise);
    const onSaved = renderForm();
    changeNickname();
    const file = choosePhoto();
    expect(document.querySelectorAll('form')).toHaveLength(1);
    expect(document.querySelectorAll('button[type="submit"]')).toHaveLength(1);
    expect(screen.queryByText('프로필 링크')).toBeNull();
    save();
    await waitFor(() => expect(state.uploadAvatar).toHaveBeenCalledWith(file, expect.any(Object)));
    expect(state.updateProfile).toHaveBeenCalledWith({ nickname: '새닉네임', bio: '' });
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: '서비스 닉네임' }).matches(':disabled')).toBe(true);
    expect(screen.getByLabelText('프로필 사진 선택').matches(':disabled')).toBe(true);
    await act(async () => upload.resolve(profile));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(confirmNavigation()).toBe(true);
  });

  it('saves details without requiring a photo', async () => {
    const onSaved = renderForm();
    changeNickname();
    save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(state.uploadAvatar).not.toHaveBeenCalled();
    expect(state.deleteAvatar).not.toHaveBeenCalled();
  });

  it('does not upload when details fail and preserves all drafts for retry', async () => {
    state.updateProfile.mockRejectedValueOnce(new ApiError(503, 'UNAVAILABLE', '프로필 저장 재시도'));
    const onSaved = renderForm();
    changeNickname();
    choosePhoto();
    save();
    expect((await screen.findByRole('alert')).textContent).toBe('프로필 저장 재시도');
    expect(state.uploadAvatar).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: '서비스 닉네임' })).toHaveProperty('value', '새닉네임');
    expect(screen.getByRole('img', { name: '선택한 프로필 사진 미리보기' })).toBeTruthy();
    save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  });

  it('retries only the failed photo after details have already saved', async () => {
    state.uploadAvatar.mockRejectedValueOnce(
      new ApiError(400, 'INVALID_AVATAR', '사진을 읽을 수 없습니다. 다른 사진을 선택해주세요.'),
    );
    const onSaved = renderForm();
    changeNickname();
    choosePhoto();
    save();
    expect((await screen.findByRole('alert')).textContent).toBe(
      '사진을 읽을 수 없습니다. 다른 사진을 선택해주세요.',
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('img', { name: '선택한 프로필 사진 미리보기' })).toBeTruthy();
    save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(state.updateProfile).toHaveBeenCalledOnce();
    expect(state.uploadAvatar).toHaveBeenCalledTimes(2);
  });

  it('defers photo removal until the same save action and supports undo', async () => {
    const onSaved = renderForm({
      ...profile,
      author: { ...profile.author, avatarUrl: '/api/users/me/avatar' },
    });
    fireEvent.click(screen.getByRole('button', { name: '프로필 사진 삭제' }));
    expect(state.deleteAvatar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '삭제 취소' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '프로필 저장' }).matches(':disabled')).toBe(true),
    );
    fireEvent.click(screen.getByRole('button', { name: '프로필 사진 삭제' }));
    save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(state.deleteAvatar).toHaveBeenCalledOnce();
    expect(state.updateProfile).not.toHaveBeenCalled();
  });

  it('keeps a failed photo removal pending until retry succeeds', async () => {
    state.deleteAvatar.mockRejectedValueOnce(new ApiError(503, 'UNAVAILABLE', '프로필 저장 재시도'));
    const onSaved = renderForm({
      ...profile,
      author: { ...profile.author, avatarUrl: '/api/users/me/avatar' },
    });
    fireEvent.click(screen.getByRole('button', { name: '프로필 사진 삭제' }));
    save();
    await screen.findByRole('alert');
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '삭제 취소' })).toBeTruthy();
    save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(state.deleteAvatar).toHaveBeenCalledTimes(2);
  });
});
