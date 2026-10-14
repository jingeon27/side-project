'use client';

import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';

import { cn } from '../../../lib/cn.helper';

export interface ISegmentedControlOption<TValue extends string> {
  value: TValue;
  label: string;
}

interface ISegmentedControlProps<TValue extends string> {
  /** 묶음의 이름(aria-label). 예: "사진 정렬" */
  label: string;
  value: TValue;
  options: readonly ISegmentedControlOption<TValue>[];
  onValueChange: (value: TValue) => void;
  className?: string;
}

/**
 * 둘 중 하나를 고르는 칸(예: 최신순 | 좋아요순). 항상 하나가 선택돼 있고, 화살표 키로 칸을 옮겨 Enter·Space로 고른다.
 */
export function SegmentedControl<TValue extends string>({
  label,
  value,
  options,
  onValueChange,
  className,
}: ISegmentedControlProps<TValue>) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(pressed) => {
        // 이미 고른 칸을 다시 눌러 선택이 비는 경우는 무시한다.
        const next = options.find((option) => option.value !== value && pressed.includes(option.value));
        if (next) onValueChange(next.value);
      }}
      className={cn('flex rounded-control bg-sunken p-1', className)}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          className={cn(
            'relative flex h-9 min-w-0 flex-1 items-center justify-center rounded-[10px] px-3 text-label text-muted transition-colors',
            "before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']",
            'hover:text-ink data-pressed:bg-surface data-pressed:text-ink data-pressed:shadow-card',
          )}
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
