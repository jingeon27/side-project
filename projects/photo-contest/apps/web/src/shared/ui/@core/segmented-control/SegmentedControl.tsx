'use client';

import type { ReactNode } from 'react';

import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';

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
      className={cn('flex rounded-card bg-sunken p-1', className)}
    >
      {children}
    </ToggleGroup>
  );
}

/**
 * 다크 모드에서는 고른 칸의 바탕(surface/sunken 1.07:1)과 글자색(ink/muted 1.97:1)만으로 구분되지 않아 테두리를 더한다.
 * 가상 요소는 테두리 안쪽을 기준으로 놓이므로 위아래로 넓히지 않고 가운데에 44px 높이로 둔다.
 */
export function SegmentedControlItem({ value, children }: { value: string; children: ReactNode }) {
  return (
    <Toggle
      value={value}
      className={cn(
        'relative flex h-9 min-w-0 flex-1 items-center justify-center rounded-control border border-transparent px-3 text-label text-muted transition-colors',
        "before:absolute before:inset-x-0 before:top-1/2 before:h-touch before:-translate-y-1/2 before:content-['']",
        'hover:text-ink data-pressed:border-control-border data-pressed:bg-surface data-pressed:text-ink data-pressed:shadow-card',
      )}
    >
      {children}
    </Toggle>
  );
}
