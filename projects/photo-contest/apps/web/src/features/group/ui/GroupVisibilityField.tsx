import type { UseFormReturn } from 'react-hook-form';

import { GroupVisibility } from '@/shared/api/generated';
import { FieldRequirement } from '@/shared/ui/@core/text-field';

import type { TCreateGroupInput } from '../model/group.schema';

export function GroupVisibilityField({ form }: { form: UseFormReturn<TCreateGroupInput> }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 flex items-center text-label text-ink">
        공개 범위
        <FieldRequirement required />
      </legend>
      <label className="flex cursor-pointer items-start gap-3 rounded-control border border-line p-4 has-checked:border-ink has-checked:bg-sunken">
        <input
          type="radio"
          value={GroupVisibility.Public}
          required
          {...form.register('visibility')}
          className="mt-1 size-4 shrink-0 accent-ink"
        />
        <span className="flex flex-col gap-1">
          <span className="text-label text-ink">공개 그룹</span>
          <span className="text-caption text-muted">
            누구나 게시물을 보고, 로그인하면 바로 가입할 수 있어요.
          </span>
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-3 rounded-control border border-line p-4 has-checked:border-ink has-checked:bg-sunken">
        <input
          type="radio"
          value={GroupVisibility.Private}
          required
          {...form.register('visibility')}
          className="mt-1 size-4 shrink-0 accent-ink"
        />
        <span className="flex flex-col gap-1">
          <span className="text-label text-ink">비공개 그룹</span>
          <span className="text-caption text-muted">
            그룹장이 가입 신청을 수락한 멤버만 게시물을 볼 수 있어요.
          </span>
        </span>
      </label>
    </fieldset>
  );
}
