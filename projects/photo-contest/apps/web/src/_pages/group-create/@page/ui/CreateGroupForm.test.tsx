import { ApolloProvider } from '@apollo/client/react';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { createGroupUploadClient, groupUploadFile } from '../../../../../test/fixtures/group-image-upload';
import { CreateGroupForm } from './CreateGroupForm';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('사진 재시도는 이미 만든 그룹과 완료한 사진을 재사용해야 한다', async () => {
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
  const { client, group, operations } = createGroupUploadClient();
  const onCreated = vi.fn();
  render(
    <ApolloProvider client={client}>
      <CreateGroupForm onCreated={onCreated} onCancel={vi.fn()} />
    </ApolloProvider>,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('그룹 이름'), group.name);
  await user.click(screen.getByText('그룹 사진 추가'));
  await user.upload(
    screen.getByLabelText('그룹 프로필 사진 선택'),
    new File(['avatar'], 'avatar.png', { type: 'image/png' }),
  );
  await user.upload(
    screen.getByLabelText('그룹 배경 사진 선택'),
    new File(['cover'], 'cover.png', { type: 'image/png' }),
  );
  const submit = screen.getByRole('button', { name: '그룹 만들기' });
  await user.click(submit);
  await screen.findByRole('alert');
  expect(onCreated).not.toHaveBeenCalled();
  await user.click(submit);
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(group.id));
  expect(operations.filter((operation) => operation.operationName === 'CreateGroup')).toHaveLength(1);
  expect(files.filter((name) => name === 'avatar.png')).toHaveLength(1);
  expect(files.filter((name) => name === 'cover.png')).toHaveLength(2);
});
