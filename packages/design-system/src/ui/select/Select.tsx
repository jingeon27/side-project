// Adapted from shadcn/ui base-nova. See SHADCN.md for source and license.
'use client';

import type { ComponentProps } from 'react';

import { Select as SelectPrimitive } from '@base-ui/react/select';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';

import { cn } from '../../lib/cn.helper';
import type { TStyledProps } from '../../lib/styled-props';

const Select = SelectPrimitive.Root;

function SelectGroup({ className, ...props }: TStyledProps<SelectPrimitive.Group.Props>) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn('scroll-my-1 py-1 first:pt-0 last:pb-0', className)}
      {...props}
    />
  );
}

function SelectValue({ className, ...props }: TStyledProps<SelectPrimitive.Value.Props>) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn('block min-w-0 flex-1 truncate text-start', className)}
      {...props}
    />
  );
}

function SelectTrigger({
  className,
  hideIcon = false,
  children,
  ...props
}: TStyledProps<SelectPrimitive.Trigger.Props> & {
  hideIcon?: boolean;
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "group/select flex h-touch w-fit min-w-0 max-w-full items-center justify-between gap-2 rounded-control border border-control-border bg-surface px-3.5 py-2 text-input text-ink motion-safe:transition-colors select-none data-popup-open:border-focus-ring data-placeholder:text-muted data-disabled:cursor-not-allowed data-disabled:bg-sunken data-disabled:text-muted aria-invalid:border-danger aria-invalid:bg-danger-soft [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      {!hideIcon && (
        <SelectPrimitive.Icon className="grid size-6 shrink-0 place-items-center rounded-badge bg-neutral-soft text-muted group-data-popup-open/select:bg-accent-soft group-data-popup-open/select:text-accent-ink">
          <ChevronDownIcon
            aria-hidden="true"
            className="size-3.5 motion-safe:transition-transform group-data-popup-open/select:rotate-180"
          />
        </SelectPrimitive.Icon>
      )}
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  side = 'bottom',
  sideOffset = 4,
  align = 'center',
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: TStyledProps<SelectPrimitive.Popup.Props> &
  Pick<
    SelectPrimitive.Positioner.Props,
    'align' | 'alignOffset' | 'side' | 'sideOffset' | 'alignItemWithTrigger'
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-popover"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          // tw-animate-css 대신 Base UI의 starting/ending style 속성으로 열고 닫는 전환을 만든다.
          className={cn(
            'relative isolate z-popover max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) min-w-[min(10rem,var(--available-width))] origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-card border border-line-strong bg-popover text-popover-foreground shadow-popover transition-[opacity,scale] duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 data-[align-trigger=true]:transition-none',
            className,
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List className="p-1">{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({ className, ...props }: TStyledProps<SelectPrimitive.GroupLabel.Props>) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn('px-3 py-1.5 text-caption font-semibold text-muted', className)}
      {...props}
    />
  );
}

function SelectItem({ className, children, ...props }: TStyledProps<SelectPrimitive.Item.Props>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      // 키보드로 가리킨 항목에는 안쪽 포커스 링을, 선택을 확정한 항목에는 체크 표시를 그린다.
      className={cn(
        "relative flex min-h-touch w-full cursor-default items-center gap-2 rounded-control py-2 ps-3 pe-9 text-input -outline-offset-3 select-none data-highlighted:bg-neutral-soft data-highlighted:text-ink data-selected:bg-accent-soft data-selected:text-accent-ink data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex min-w-0 flex-1 items-center gap-2 text-start whitespace-normal wrap-anywhere">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute end-3 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon aria-hidden="true" strokeWidth={2.5} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({ className, ...props }: TStyledProps<SelectPrimitive.Separator.Props>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('pointer-events-none mx-2 my-1 h-px bg-line', className)}
      {...props}
    />
  );
}

function SelectScrollUpButton({ className, ...props }: ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronUpIcon aria-hidden="true" />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronDownIcon aria-hidden="true" />
    </SelectPrimitive.ScrollDownArrow>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
