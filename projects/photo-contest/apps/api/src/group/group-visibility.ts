export const GROUP_VISIBILITY = {
  PUBLIC: 'PUBLIC',
  PRIVATE: 'PRIVATE',
} as const;

export type TGroupVisibility = (typeof GROUP_VISIBILITY)[keyof typeof GROUP_VISIBILITY];

/** 저장된 값을 알 수 없을 때는 게시물을 공개하지 않는다. */
export function toGroupVisibility(value: string): TGroupVisibility {
  return value === GROUP_VISIBILITY.PUBLIC ? GROUP_VISIBILITY.PUBLIC : GROUP_VISIBILITY.PRIVATE;
}
