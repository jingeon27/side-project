import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, type PublicProfile } from '@/shared/api';
import { confirmNavigation, NavigationGuardProvider } from '@/shared/navigation';

import { ProfileEditForm } from './ProfileEditForm';

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

function renderForm() {
  const onSaved = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <NavigationGuardProvider>
        <ProfileEditForm onSaved={onSaved} profile={profile} />
      </NavigationGuardProvider>
    </QueryClientProvider>,
  );
  return onSaved;
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

function saveNickname(nickname: string) {
  const details = screen.getByRole('form', { name: '프로필 수정' });
  fireEvent.change(within(details).getByRole('textbox', { name: '서비스 닉네임' }), {
    target: { value: nickname },
  });
  fireEvent.click(within(details).getByRole('button', { name: '프로필 저장' }));
}

beforeEach(() => {
  state.updateProfile.mockReset().mockImplementation(async (input: { nickname: string; bio: string }) => ({
    ...profile,
    author: { ...profile.author, nickname: input.nickname },
    bio: input.bio,
  }));
  state.uploadAvatar.mockReset();
  state.refresh.mockReset();
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

describe('profile edit form', () => {
  it.each(['details', 'photo', 'links'])('confirms leaving with an unsaved %s draft', (section) => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderForm();
    expect(confirmNavigation()).toBe(true);
    if (section === 'details') {
      fireEvent.change(screen.getByRole('textbox', { name: '자기소개' }), {
        target: { value: '저장하지 않은 소개' },
      });
    }
    if (section === 'photo') choosePhoto();
    if (section === 'links') addLinkDraft();
    expect(confirmNavigation()).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('discards all drafts only after confirming departure even if Next retains the form', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderForm();
    const bio = screen.getByRole('textbox', { name: '자기소개' });
    fireEvent.change(bio, { target: { value: '버릴 소개' } });
    const photo = choosePhoto();
    const links = addLinkDraft();

    await act(async () => expect(confirmNavigation()).toBe(false));
    expect(bio).toHaveProperty('value', '버릴 소개');
    expect(within(photo).getByRole('img', { name: '선택한 프로필 사진 미리보기' })).toBeTruthy();
    expect(within(links).getByRole('textbox', { name: /이름/ })).toHaveProperty('value', '나의 방송');

    confirm.mockReturnValue(true);
    await act(async () => expect(confirmNavigation()).toBe(true));
    expect(bio).toHaveProperty('value', '');
    expect(within(photo).queryByRole('img', { name: '선택한 프로필 사진 미리보기' })).toBeNull();
    expect(within(links).queryByRole('textbox', { name: /이름/ })).toBeNull();
    expect(confirmNavigation()).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  // 정보 저장이 곧바로 화면을 떠나(예전에는 시트를 닫아) 고르던 사진·링크 초안이 말없이 사라졌다.
  it('saves the profile details without leaving or dropping photo and link drafts', async () => {
    const onSaved = renderForm();
    const photo = choosePhoto();
    const links = addLinkDraft();

    saveNickname('새닉네임');

    await waitFor(() => expect(state.updateProfile).toHaveBeenCalledWith({ nickname: '새닉네임', bio: '' }));
    await waitFor(() => expect(state.refresh).toHaveBeenCalledOnce());
    expect(onSaved).not.toHaveBeenCalled();
    expect(within(photo).getByRole('img', { name: '선택한 프로필 사진 미리보기' })).toBeTruthy();
    expect(within(links).getByRole('textbox', { name: /이름/ })).toHaveProperty('value', '나의 방송');
  });

  it('finishes editing after saving the details when nothing else is unsaved', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const onSaved = renderForm();
    saveNickname('새닉네임');
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(state.refresh).not.toHaveBeenCalled();
    expect(confirmNavigation()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('shows a failed photo upload as a translated error notice and keeps the selected photo', async () => {
    const upload = Promise.withResolvers<PublicProfile>();
    state.uploadAvatar.mockReturnValueOnce(upload.promise);
    renderForm();
    const photo = choosePhoto();
    fireEvent.click(within(photo).getByRole('button', { name: '사진 저장' }));
    await waitFor(() => expect(state.uploadAvatar).toHaveBeenCalledOnce());

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
