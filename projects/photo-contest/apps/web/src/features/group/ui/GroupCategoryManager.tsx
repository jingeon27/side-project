'use client';

import {
  skipToken,
  useBackgroundQuery,
  useMutation,
  useReadQuery,
  type QueryRef,
} from '@apollo/client/react';
import { overlay } from 'overlay-kit';

import {
  ArchiveGroupCategoryDocument,
  CreateGroupCategoryDocument,
  GalleryDocument,
  GroupCategoriesDocument,
  PostCategoryOptionsDocument,
  RenameGroupCategoryDocument,
  ReorderGroupCategoriesDocument,
  type GroupCategoriesQuery,
  type GroupCategoryRowFragment,
} from '@/shared/api/generated';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { getErrorMessage } from '@/shared/model/error';
import { useZodForm } from '@/shared/model/form';
import { useIsSSR } from '@/shared/model/is-ssr.hook';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Button } from '@/shared/ui/@core/button';
import { ConfirmDialog } from '@/shared/ui/@core/confirm-dialog';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TextField } from '@/shared/ui/@core/text-field';

import { isGroupAdmin } from '../lib/group.helper';
import { groupCategorySchema, moveGroupCategory } from '../model/group-category.schema';

const REFRESH = [GroupCategoriesDocument, GalleryDocument, PostCategoryOptionsDocument];
function CategoryRow({
  category,
  first,
  last,
  busy,
  onMove,
}: {
  category: GroupCategoryRowFragment;
  first: boolean;
  last: boolean;
  busy: boolean;
  onMove: (direction: -1 | 1) => Promise<unknown>;
}) {
  const form = useZodForm(groupCategorySchema, { defaultValues: { name: category.name } });
  const [rename, { loading: renaming }] = useMutation(RenameGroupCategoryDocument, {
    refetchQueries: REFRESH,
    awaitRefetchQueries: true,
  });
  const [archive, { loading: archiving }] = useMutation(ArchiveGroupCategoryDocument, {
    refetchQueries: REFRESH,
    awaitRefetchQueries: true,
  });
  const disabled = busy || renaming || archiving;
  return (
    <li className="flex flex-col gap-2 border-t border-line pt-4">
      <form
        className="flex items-end gap-2"
        noValidate
        onSubmit={form.handleSubmit(async ({ name }) => {
          try {
            await rename({ variables: { categoryId: category.id, name } });
          } catch {
            /* ErrorLink가 알린다. */
          }
        })}
      >
        <TextField
          required
          label={`${category.name} 이름`}
          maxLength={20}
          disabled={disabled}
          className="min-w-0 flex-1"
          error={form.formState.errors.name?.message}
          {...form.register('name')}
        />
        <Button type="submit" variant="secondary" size="sm" disabled={disabled}>
          이름 변경
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${category.name} 위로`}
          disabled={first || disabled}
          onClick={async () => {
            try {
              await onMove(-1);
            } catch {
              /* ErrorLink가 알린다. */
            }
          }}
        >
          위로
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${category.name} 아래로`}
          disabled={last || disabled}
          onClick={async () => {
            try {
              await onMove(1);
            } catch {
              /* ErrorLink가 알린다. */
            }
          }}
        >
          아래로
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-label={`${category.name} 보관`}
          onClick={() =>
            overlay.open(({ isOpen, close, unmount }) => (
              <ConfirmDialog
                isOpen={isOpen}
                onClose={close}
                unmount={unmount}
                title="카테고리를 보관할까요?"
                description="새 글에서는 선택할 수 없고 기존 글의 분류는 그대로 남아요."
                confirmLabel="보관하기"
                onConfirm={() => archive({ variables: { categoryId: category.id } }).then(() => undefined)}
              />
            ))
          }
        >
          보관
        </Button>
      </div>
    </li>
  );
}
function CategoryManagement({ queryRef }: { queryRef: QueryRef<GroupCategoriesQuery> }) {
  const { data } = useReadQuery(queryRef);
  const group = data.group;
  const form = useZodForm(groupCategorySchema, { defaultValues: { name: '' } });
  // 다른 화면의 목록 갱신까지 기다리지 않고 생성 결과로 입력을 비워 다음 이름을 바로 쓸 수 있게 한다.
  const [create, { loading, error }] = useMutation(CreateGroupCategoryDocument, {
    refetchQueries: REFRESH,
    context: { errorToast: false },
    onCompleted: () => trackEvent(ANALYTICS_EVENT.CategoryCreated, { group_id: group.id }),
  });
  const [reorder, { loading: reordering }] = useMutation(ReorderGroupCategoriesDocument, {
    refetchQueries: REFRESH,
    awaitRefetchQueries: true,
  });
  if (!isGroupAdmin(group.role)) return null;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-caption text-muted">카테고리 {group.categories.length}/20 · 선택은 자유예요.</p>
      <ul className="flex flex-col gap-4">
        {group.categories.map((category, index) => (
          <CategoryRow
            key={`${category.id}:${category.name}`}
            category={category}
            first={index === 0}
            last={index === group.categories.length - 1}
            busy={reordering}
            onMove={(direction) =>
              reorder({
                variables: {
                  groupId: group.id,
                  categoryIds: moveGroupCategory(
                    group.categories.map((c) => c.id),
                    category.id,
                    direction,
                  ),
                },
              })
            }
          />
        ))}
      </ul>
      <form
        noValidate
        className="flex flex-col gap-3 border-t border-line pt-4"
        onSubmit={form.handleSubmit(async ({ name }) => {
          try {
            await create({ variables: { groupId: group.id, name } });
            // 생성을 기다리는 동안 새로 입력한 이름은 지우지 않는다.
            if (form.getValues('name').trim() === name) form.reset();
          } catch {
            /* 이 폼 아래에 오류를 표시한다. */
          }
        })}
      >
        <TextField
          label="새 카테고리"
          required
          maxLength={20}
          error={form.formState.errors.name?.message}
          {...form.register('name')}
        />
        <Button type="submit" variant="secondary" loading={loading} disabled={group.categories.length >= 20}>
          카테고리 만들기
        </Button>
        {error ? (
          <p role="alert" className="text-caption text-danger">
            {getErrorMessage(error)}
          </p>
        ) : null}
      </form>
    </div>
  );
}
export function GroupCategoryManager({ groupId }: { groupId: string }) {
  const [queryRef, { refetch }] = useBackgroundQuery(
    GroupCategoriesDocument,
    useIsSSR() ? skipToken : { variables: { id: groupId } },
  );
  const fallback = <Skeleton className="h-24 w-full" />;
  return (
    <details className="rounded-card border border-line bg-surface p-4">
      <summary className="min-h-touch cursor-pointer content-center text-label text-ink">
        카테고리 관리
      </summary>
      <div className="mt-4">
        <AsyncBoundary onRetry={refetch} fallback={fallback}>
          {queryRef ? <CategoryManagement queryRef={queryRef} /> : fallback}
        </AsyncBoundary>
      </div>
    </details>
  );
}
