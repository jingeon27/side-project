'use client';

import { useId, type ComponentProps } from 'react';

import { NativeSelect, NativeSelectOption } from '@side/design-system';

import { FieldRequirement } from '@/shared/ui/@core/text-field';

export function PostCategorySelect({
  categories,
  ...props
}: Omit<ComponentProps<'select'>, 'size'> & { categories: readonly { id: string; name: string }[] }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-label text-ink">
        카테고리
        <FieldRequirement required={false} />
      </label>
      {/* 제목·링크 입력과 같은 높이·테두리를 쓰도록 공통 native select를 쓴다. */}
      <NativeSelect id={id} {...props}>
        <NativeSelectOption value="">미분류</NativeSelectOption>
        {categories.map((category) => (
          <NativeSelectOption key={category.id} value={category.id}>
            {category.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
