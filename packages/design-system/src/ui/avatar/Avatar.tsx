import type { ComponentProps } from 'react';

import { Avatar as BaseAvatar } from '@base-ui/react/avatar';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/cn.helper';

const avatarVariants = cva(
  'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-soft text-brand-strong select-none',
  {
    variants: {
      size: {
        sm: 'size-8 text-caption',
        md: 'size-10 text-label',
        lg: 'size-16 text-title',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

export interface IAvatarProps
  extends
    Omit<ComponentProps<typeof BaseAvatar.Root>, 'className' | 'children'>,
    VariantProps<typeof avatarVariants> {
  /** 사진이 없을 때 첫 글자를 보여 줄 이름 */
  name: string;
  src?: string | null;
  className?: string;
}

/**
 * 이름 옆에 붙는 장식용 프로필 사진. 이름은 옆 글자가 읽어 주므로 스크린 리더에서는 숨긴다.
 * native span props(id·title·data-*·ref)는 Root에 그대로 전달한다.
 */
export function Avatar({ name, src, size, className, ...props }: IAvatarProps) {
  const initial = Array.from(name.trim())[0] ?? '?';
  return (
    <BaseAvatar.Root
      aria-hidden
      data-slot="avatar"
      {...props}
      className={cn(avatarVariants({ size }), className)}
    >
      {src ? (
        <BaseAvatar.Image src={src} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
      ) : null}
      <BaseAvatar.Fallback className="font-bold">{initial}</BaseAvatar.Fallback>
    </BaseAvatar.Root>
  );
}
