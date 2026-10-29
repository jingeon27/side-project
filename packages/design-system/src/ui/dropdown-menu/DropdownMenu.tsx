// Adapted from shadcn/ui base-nova. See SHADCN.md for source and license.
'use client';

import { Menu as MenuPrimitive } from '@base-ui/react/menu';

import { cn } from '../../lib/cn.helper';
import type { TStyledProps } from '../../lib/styled-props';

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
  align = 'start',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 4,
  className,
  ...props
}: TStyledProps<MenuPrimitive.Popup.Props> &
  Pick<MenuPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="isolate z-popover outline-hidden"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          // tw-animate-css 대신 Base UI의 starting/ending style 속성으로 열고 닫는 전환을 만든다.
          className={cn(
            'z-popover max-h-(--available-height) min-w-48 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-control bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 transition-[opacity,scale] duration-100 outline-hidden data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 data-closed:overflow-hidden',
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuItem({
  className,
  inset,
  variant = 'default',
  ...props
}: TStyledProps<MenuPrimitive.Item.Props> & {
  inset?: boolean;
  /** danger는 삭제·차단처럼 되돌리기 어려운 행동이다(Button의 danger와 같은 이름). */
  variant?: 'default' | 'danger';
}) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "group/dropdown-menu-item relative flex min-h-touch cursor-default items-center gap-1.5 rounded-control px-3 py-2 text-input outline-hidden select-none data-highlighted:bg-neutral-soft data-highlighted:text-ink data-inset:pl-7 data-[variant=danger]:text-danger data-[variant=danger]:data-highlighted:bg-danger-soft data-[variant=danger]:data-highlighted:text-danger data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=danger]:*:[svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem };
