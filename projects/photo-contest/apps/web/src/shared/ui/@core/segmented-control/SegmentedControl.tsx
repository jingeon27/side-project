'use client';

import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import type { ReactNode } from 'react';

import { cn } from '../../../lib/cn.helper';

interface ISegmentedControlProps {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}

/** 고정 선택지는 호출하는 화면에서 Item을 직접 선언한다. */
export function SegmentedControl({
  label,
  value,
  onValueChange,
  children,
  className,
}: ISegmentedControlProps) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(pressed) => {
        const next = pressed.find((item) => item !== value);
        if (next) onValueChange(next);
      }}
      className={cn('flex rounded-control bg-sunken p-1', className)}
    >
      {children}
    </ToggleGroup>
  );
}

export function SegmentedControlItem({ value, children }: { value: string; children: ReactNode }) {
  return (
    <Toggle
      value={value}
      className={cn(
        'relative flex h-9 min-w-0 flex-1 items-center justify-center rounded-[10px] px-3 text-label text-muted transition-colors',
        "before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']",
        'hover:text-ink data-pressed:bg-surface data-pressed:text-ink data-pressed:shadow-card',
      )}
    >
      {children}
    </Toggle>
  );
}
