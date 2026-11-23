// Adapted from the ReUI Base Nova Timeline registry item.
// https://reui.io/r/base-nova/timeline.json
// MIT license and copyright notice: /licenses/reui.txt

import { createContext, useContext } from 'react';

import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';

import { cn } from '@side/design-system';

const TimelineContext = createContext<number | undefined>(undefined);

interface ITimelineProps extends useRender.ComponentProps<'div'> {
  value: number;
  orientation?: 'horizontal' | 'vertical';
}

export function Timeline({
  value,
  orientation = 'vertical',
  className,
  render,
  children,
  ...props
}: ITimelineProps) {
  const defaultProps = {
    className: cn(
      'group/timeline flex data-[orientation=horizontal]:w-full data-[orientation=horizontal]:flex-row data-[orientation=vertical]:flex-col',
      className,
    ),
    'data-orientation': orientation,
    'data-slot': 'timeline',
    children,
  };
  const root = useRender({
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(defaultProps, props),
  });

  return <TimelineContext.Provider value={value}>{root}</TimelineContext.Provider>;
}

interface ITimelineItemProps extends useRender.ComponentProps<'div'> {
  step: number;
  completed?: boolean;
}

export function TimelineItem({ step, completed, className, render, children, ...props }: ITimelineItemProps) {
  const value = useContext(TimelineContext);
  if (value === undefined) throw new Error('TimelineItem must be used within a Timeline');
  const isComplete = completed ?? step <= value;
  const defaultProps = {
    className: cn(
      'group/timeline-item relative flex flex-1 flex-col gap-0.5 group-data-[orientation=vertical]/timeline:ms-8 group-data-[orientation=horizontal]/timeline:mt-8 group-data-[orientation=horizontal]/timeline:not-last:pe-8 group-data-[orientation=vertical]/timeline:not-last:pb-6',
      className,
    ),
    'data-completed': isComplete || undefined,
    'data-slot': 'timeline-item',
    children,
  };

  return useRender({
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(defaultProps, props),
  });
}

export function TimelineHeader({ className, render, children, ...props }: useRender.ComponentProps<'div'>) {
  const defaultProps = { className, 'data-slot': 'timeline-header', children };
  return useRender({
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(defaultProps, props),
  });
}

export function TimelineIndicator({
  className,
  children,
  render,
  ...props
}: useRender.ComponentProps<'div'>) {
  const defaultProps = {
    'aria-hidden': true,
    className: cn(
      'group-data-[orientation=horizontal]/timeline:-top-6 group-data-[orientation=horizontal]/timeline:-translate-y-1/2 group-data-[orientation=vertical]/timeline:-left-6 group-data-[orientation=vertical]/timeline:-translate-x-1/2 absolute size-4 rounded-full border-2 border-primary/20 group-data-[orientation=vertical]/timeline:top-0 group-data-[orientation=horizontal]/timeline:left-0 group-data-completed/timeline-item:border-primary',
      className,
    ),
    'data-slot': 'timeline-indicator',
    children,
  };
  return useRender({
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(defaultProps, props),
  });
}

export function TimelineSeparator({
  className,
  render,
  children,
  ...props
}: useRender.ComponentProps<'div'>) {
  const defaultProps = {
    'aria-hidden': true,
    className: cn(
      'group-data-[orientation=horizontal]/timeline:-top-6 group-data-[orientation=horizontal]/timeline:-translate-y-1/2 group-data-[orientation=vertical]/timeline:-left-6 group-data-[orientation=vertical]/timeline:-translate-x-1/2 absolute self-start bg-primary/10 group-last/timeline-item:hidden group-data-[orientation=horizontal]/timeline:h-0.5 group-data-[orientation=vertical]/timeline:h-[calc(100%-1rem-0.25rem)] group-data-[orientation=horizontal]/timeline:w-[calc(100%-1rem-0.25rem)] group-data-[orientation=vertical]/timeline:w-0.5 group-data-[orientation=horizontal]/timeline:translate-x-4.5 group-data-[orientation=vertical]/timeline:translate-y-4.5',
      className,
    ),
    'data-slot': 'timeline-separator',
    children,
  };
  return useRender({
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(defaultProps, props),
  });
}

export function TimelineTitle({ className, children, render, ...props }: useRender.ComponentProps<'h3'>) {
  const defaultProps = {
    className: cn('font-medium text-sm', className),
    'data-slot': 'timeline-title',
    children,
  };
  return useRender({
    defaultTagName: 'h3',
    render,
    props: mergeProps<'h3'>(defaultProps, props),
  });
}
