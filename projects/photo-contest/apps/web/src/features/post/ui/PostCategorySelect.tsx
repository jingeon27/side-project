'use client';
import { FieldRequirement } from '@/shared/ui/@core/text-field';
import { useId, type ComponentProps } from 'react';

export function PostCategorySelect({
  categories,
  ...props
}: ComponentProps<'select'> & { categories: readonly { id: string; name: string }[] }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-label text-ink">
        카테고리
        <FieldRequirement required={false} />
      </label>
      <select
        id={id}
        className="min-h-touch w-full rounded-control border border-line-strong bg-surface px-3 text-body text-ink"
        {...props}
      >
        <option value="">미분류</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
    </div>
  );
}
