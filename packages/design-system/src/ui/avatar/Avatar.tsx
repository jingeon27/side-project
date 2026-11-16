import type { ComponentProps } from 'react';

import { Avatar as BaseAvatar } from '@base-ui/react/avatar';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/cn.helper';

/**
 * gradient를 뺀 모든 tone은 라이트·다크 모드에서 첫 글자 대비 4.5:1 이상을 유지한다(Avatar.spec.tsx).
 * gradient는 브랜드 그라데이션 위 흰 장식 머리글자다. 아바타는 aria-hidden이고 이름은 옆 글자가 읽는다.
 */
const avatarVariants = cva('inline-flex shrink-0 items-center justify-center overflow-hidden select-none', {
  variants: {
    /** 사람은 원, 그룹처럼 사람이 아닌 대상은 둥근 사각형(squircle은 더 둥근 그룹 머리글자)으로 구분한다. */
    shape: {
      circle: 'rounded-full',
      square: 'rounded-card',
      squircle: 'rounded-[36%]',
    },
    /** 배지와 이름이 같은 tone은 색도 같다. */
    tone: {
      brand: 'bg-brand-soft text-brand-strong',
      accent: 'bg-accent-soft text-accent-ink',
      /* 배지 outline과 같은 line 테두리·ink 글자이고, 사진이 비는 자리라 바탕만 surface 대신 sunken을 쓴다. */
      outline: 'border border-line bg-sunken text-ink',
      gradient: 'bg-brand-gradient text-on-gradient',
    },
    size: {
      sm: 'size-8 text-caption',
      md: 'size-10 text-label',
      lg: 'size-16 text-title',
    },
  },
  // 32px에 card 모서리(12px)를 주면 원에 가깝게 보여 사람 아바타와 구분되지 않는다.
  compoundVariants: [{ shape: 'square', size: 'sm', className: 'rounded-control' }],
  defaultVariants: { shape: 'circle', tone: 'brand', size: 'md' },
});

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
export function Avatar({ name, src, shape, tone, size, className, ...props }: IAvatarProps) {
  const initial = Array.from(name.trim())[0] ?? '?';
  return (
    <BaseAvatar.Root
      aria-hidden
      data-slot="avatar"
      {...props}
      className={cn(avatarVariants({ shape, tone, size }), className)}
    >
      {src ? (
        <BaseAvatar.Image src={src} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
      ) : null}
      <BaseAvatar.Fallback className="font-bold">{initial}</BaseAvatar.Fallback>
    </BaseAvatar.Root>
  );
}
