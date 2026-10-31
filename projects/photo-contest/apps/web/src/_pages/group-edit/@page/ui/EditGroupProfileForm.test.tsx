import { ApolloProvider, useBackgroundQuery } from '@apollo/client/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { GroupProfileDocument } from '@/shared/api/generated';

import { createGroupUploadClient, groupUploadFile } from '../../../../../test/fixtures/group-image-upload';
import { EditGroupProfileForm } from './EditGroupProfileForm';

afterEach(() => {
  vi.unstubAllGlobals();
});

async function prepareForm(options: { saveFailures?: number } = {}) {
  const { client, group, operations } = createGroupUploadClient(options);
  const onSaved = vi.fn();
  function Form() {
    const [queryRef] = useBackgroundQuery(GroupProfileDocument, { variables: { id: group.id } });
    return <EditGroupProfileForm queryRef={queryRef} onSaved={onSaved} onCancel={vi.fn()} />;
  }
  const { unmount } = render(
    <ApolloProvider client={client}>
      <Form />
    </ApolloProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByText('그룹 사진 변경'));
  await user.upload(
    screen.getByLabelText('그룹 사진 선택'),
    new File(['avatar'], 'avatar.png', { type: 'image/png' }),
  );
  await user.upload(
    screen.getByLabelText('그룹 배경 사진 선택'),
    new File(['cover'], 'cover.png', { type: 'image/png' }),
  );
  return {
    user,
    onSaved,
    operations,
    unmount,
    submit: screen.getByRole('button', { name: '프로필 저장하기' }),
  };
}

it('한 사진만 실패하면 완료한 사진은 재전송하지 않고 실패한 사진만 다시 저장해야 한다', async () => {
  const files: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, options?: RequestInit) => {
      const file = groupUploadFile(options);
      files.push(file.name);
      return new Response(null, {
        status:
          file.name === 'cover.png' && files.filter((name) => name === file.name).length === 1 ? 503 : 204,
      });
    }),
  );
  const { user, submit, onSaved, operations } = await prepareForm();
  await user.click(submit);
  await screen.findByRole('alert');
  expect(onSaved).not.toHaveBeenCalled();
  await user.click(submit);
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(files.filter((name) => name === 'avatar.png')).toHaveLength(1);
  expect(files.filter((name) => name === 'cover.png')).toHaveLength(2);
  const saved = operations.find((operation) => operation.operationName === 'UpdateGroupProfile');
  expect(saved?.variables).toMatchObject({ avatarId: 'upload-1', coverId: 'upload-4' });
});

it('한 사진이 실패해도 다른 전송이 끝날 때까지 저장과 입력을 잠가야 한다', async () => {
  const remaining = Promise.withResolvers<Response>();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, options?: RequestInit) =>
      groupUploadFile(options).name === 'avatar.png'
        ? new Response(null, { status: 503 })
        : remaining.promise,
    ),
  );
  const { user, submit } = await prepareForm();
  await user.click(submit);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  await act(async () => {
    await Promise.resolve();
  });
  expect(submit).toHaveAttribute('aria-disabled', 'true');
  expect(submit).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByLabelText('그룹 이름')).toBeDisabled();
  await user.click(submit);
  expect(fetch).toHaveBeenCalledTimes(2);
  await act(async () => {
    remaining.resolve(new Response(null, { status: 204 }));
  });
  await screen.findByRole('alert');
  expect(submit).toBeEnabled();
});

it('최종 프로필 저장만 실패하면 사진을 다시 올리지 않고 저장만 재시도해야 한다', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 204 })),
  );
  const { user, submit, onSaved, operations } = await prepareForm({ saveFailures: 1 });
  await user.click(submit);
  await waitFor(() => {
    expect(operations.filter((operation) => operation.operationName === 'UpdateGroupProfile')).toHaveLength(
      1,
    );
    expect(submit).not.toHaveAttribute('aria-busy', 'true');
  });
  expect(onSaved).not.toHaveBeenCalled();
  expect(screen.getByLabelText('그룹 이름')).toHaveValue('사진 그룹');
  await user.click(submit);
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(operations.filter((operation) => operation.operationName === 'UpdateGroupProfile')).toHaveLength(2);
});

it('전송 중 페이지를 떠나면 뒤늦은 완료 응답으로 프로필을 저장하지 않아야 한다', async () => {
  const remaining = Promise.withResolvers<Response>();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => remaining.promise),
  );
  const { user, submit, unmount, onSaved, operations } = await prepareForm();
  await user.click(submit);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  unmount();
  await act(async () => {
    remaining.resolve(new Response(null, { status: 204 }));
  });
  expect(onSaved).not.toHaveBeenCalled();
  expect(
    operations.filter((operation) => operation.operationName === 'CompleteGroupAvatarUpload'),
  ).toHaveLength(0);
  expect(operations.filter((operation) => operation.operationName === 'UpdateGroupProfile')).toHaveLength(0);
});
