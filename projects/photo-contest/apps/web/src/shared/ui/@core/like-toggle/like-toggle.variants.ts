import { cva, type VariantProps } from 'class-variance-authority';

/**
 * 좋아요 토글의 자리별 밀도. 눌림 색은 aria-pressed가 정하므로 liked 같은 켜짐/꺼짐은 variant로 두지 않는다.
 * - card: 게시물 카드(44px). 눌리면 배경까지 칠한다.
 * - chip: 이전 대회 사진(36px 칩)
 * - inline: 댓글 줄 안의 작은 글자
 */
export const likeToggleVariants = cva('gap-1.5', {
  variants: {
    density: {
      card: 'rounded-full px-2 aria-pressed:bg-danger-soft aria-pressed:text-danger',
      chip: 'rounded-full px-2.5 text-ink aria-pressed:text-danger',
      inline: 'px-2 text-micro text-muted aria-pressed:text-danger',
    },
  },
  defaultVariants: { density: 'card' },
});

export const likeIconVariants = cva('', {
  variants: { density: { card: 'size-5', chip: 'size-5', inline: 'size-4' } },
  defaultVariants: { density: 'card' },
});

export const likeCountVariants = cva('', {
  variants: { density: { card: 'text-caption', chip: 'tabular-nums', inline: '' } },
  defaultVariants: { density: 'card' },
});

export type TLikeToggleVariants = VariantProps<typeof likeToggleVariants>;
export type TLikeDensity = NonNullable<TLikeToggleVariants['density']>;
