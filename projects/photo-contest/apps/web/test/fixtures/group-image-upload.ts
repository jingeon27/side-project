import { ApolloClient, ApolloLink, InMemoryCache, Observable, type Operation } from '@apollo/client';
import dayjs from 'dayjs';
import { match } from 'ts-pattern';

import { GroupProfileDocument, GroupRole, MyGroupsDocument } from '../../src/shared/api/generated';

export function createGroupUploadClient({ saveFailures = 0 }: { saveFailures?: number } = {}) {
  const operations: Operation[] = [];
  const group = {
    __typename: 'Group' as const,
    id: 'upload-group',
    name: '사진 그룹',
    description: '함께 나누는 사진',
    avatarUrl: null,
    coverUrl: null,
    role: GroupRole.Owner,
    memberCount: 1,
  };
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink(
      (operation) =>
        new Observable((observer) => {
          operations.push(operation);
          if (
            operation.operationName === 'UpdateGroupProfile' &&
            operations.filter((item) => item.operationName === 'UpdateGroupProfile').length <= saveFailures
          ) {
            observer.error(new Error('프로필 저장 실패'));
            return;
          }
          const data = match(operation.operationName)
            .with('CreateGroup', () => ({ createGroup: group }))
            .with('RequestGroupAvatarUpload', () => ({
              requestGroupAvatarUpload: {
                __typename: 'UploadTicket',
                id: `upload-${operations.length}`,
                url: 'https://storage.invalid/group-photo',
                expiresAt: dayjs().add(5, 'minute').toISOString(),
                fields: [
                  { __typename: 'UploadFormField', name: 'key', value: `upload-${operations.length}` },
                ],
              },
            }))
            .with('CompleteGroupAvatarUpload', () => ({
              completeGroupAvatarUpload: {
                __typename: 'GroupAvatarTicket',
                id: operation.variables.uploadId,
              },
            }))
            .with('UpdateGroupProfile', () => ({ updateGroupProfile: group }))
            .with('MyGroups', () => ({ myGroups: [group] }))
            .otherwise(() => ({}));
          observer.next({ data });
          observer.complete();
        }),
    ),
  });
  client.writeQuery({ query: GroupProfileDocument, variables: { id: group.id }, data: { group } });
  client.writeQuery({ query: MyGroupsDocument, data: { myGroups: [] } });
  return { client, group, operations };
}

export function groupUploadFile(options?: RequestInit) {
  if (!(options?.body instanceof FormData)) throw new Error('업로드 FormData가 필요합니다.');
  const file = options.body.get('file');
  if (!(file instanceof File)) throw new Error('업로드 파일이 필요합니다.');
  return file;
}
