import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/** theme.css의 커스텀 토큰. 등록하지 않으면 tailwind-merge가 `text-title`을 글자색으로 보고 `text-ink`와 충돌시켜 지운다. */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'display',
        'title-lg',
        'title',
        'subtitle',
        'body',
        'input',
        'button',
        'label',
        'caption',
        'micro',
      ],
      radius: ['badge', 'control', 'card', 'sheet'],
      shadow: ['app', 'card', 'sheet', 'toast'],
      spacing: ['app-bar', 'bottom-nav', 'cta', 'touch'],
      breakpoint: ['pc'],
    },
    classGroups: {
      z: [{ z: ['app-bar', 'bottom-nav', 'sticky-cta', 'sheet', 'dialog', 'toast'] }],
      'max-w': [{ 'max-w': ['app'] }],
    },
  },
});

/** 조건부 클래스를 합치고 Tailwind 충돌은 뒤에 온 값을 남긴다. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
