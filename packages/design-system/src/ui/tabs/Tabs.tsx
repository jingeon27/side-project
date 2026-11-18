// Adapted from shadcn/ui base-nova. See SHADCN.md for source and license.
'use client';

import { createContext, useContext } from 'react';

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/cn.helper';
import type { TStyledProps } from '../../lib/styled-props';

function Tabs({ className, orientation = 'horizontal', ...props }: TStyledProps<TabsPrimitive.Root.Props>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      orientation={orientation}
      data-orientation={orientation}
      className={cn('group/tabs flex gap-3 data-[orientation=horizontal]:flex-col', className)}
      {...props}
    />
  );
}

/** 기본 탭은 선택한 칸을 채우고, line 탭은 선택한 가장자리를 강조한다. */
const tabsListVariants = cva(
  'group/tabs-list inline-flex items-center text-muted group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col group-data-[orientation=vertical]/tabs:items-stretch',
  {
    variants: {
      variant: {
        default:
          'w-fit max-w-full gap-1 rounded-control bg-sunken p-1 group-data-[orientation=horizontal]/tabs:rounded-full',
        line: 'w-full gap-1 border-line group-data-[orientation=horizontal]/tabs:border-b group-data-[orientation=vertical]/tabs:w-fit group-data-[orientation=vertical]/tabs:border-l',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

type TTabsListVariant = NonNullable<VariantProps<typeof tabsListVariants>['variant']>;

const tabsTriggerVariants = cva(
  [
    'relative inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 px-3.5 text-label whitespace-nowrap text-muted motion-safe:transition-colors select-none',
    '[@media(hover:hover)]:[&:where(:hover:not([data-active],[data-disabled]))]:text-ink data-disabled:pointer-events-none data-disabled:opacity-45 forced-colors:data-active:underline',
    'data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        // 가로 탭의 터치 영역은 44px이다. 세로 탭은 보이는 칸도 44px로 두어 인접 터치 영역이 겹치지 않는다.
        default:
          "h-9 rounded-badge border border-transparent before:absolute before:inset-x-0 before:top-1/2 before:h-touch before:-translate-y-1/2 before:content-[''] data-active:border-brand data-active:bg-brand data-active:text-on-brand data-[orientation=horizontal]:rounded-full data-[orientation=vertical]:min-h-touch",
        line: 'min-h-touch border-transparent active:bg-sunken data-active:border-accent-ink data-active:text-ink data-[orientation=horizontal]:-mb-px data-[orientation=horizontal]:border-b-2 data-[orientation=vertical]:-ml-px data-[orientation=vertical]:border-l-2',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

const TabsListVariantContext = createContext<TTabsListVariant>('default');

function TabsList({
  className,
  variant = 'default',
  ...props
}: TStyledProps<TabsPrimitive.List.Props> & VariantProps<typeof tabsListVariants>) {
  const listVariant = variant ?? 'default';
  return (
    <TabsListVariantContext.Provider value={listVariant}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={listVariant}
        className={cn(tabsListVariants({ variant: listVariant }), className)}
        {...props}
      />
    </TabsListVariantContext.Provider>
  );
}

function TabsTrigger({ className, ...props }: TStyledProps<TabsPrimitive.Tab.Props>) {
  const variant = useContext(TabsListVariantContext);
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(tabsTriggerVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TStyledProps<TabsPrimitive.Panel.Props>) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      // 포커스할 내용이 없으면 패널 자체가 Tab 순서에 들어간다. 전역 :focus-visible outline이 링을 그린다.
      className={cn('flex-1 text-body text-ink', className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
