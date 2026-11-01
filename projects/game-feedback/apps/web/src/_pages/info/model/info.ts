export type TInfoKind = 'guide' | 'terms' | 'privacy' | 'contact';
export const infoTitles = {
  guide: '이용 가이드',
  terms: '이용약관',
  privacy: '개인정보 처리방침',
  contact: 'Game Mate에 이야기해주세요',
} satisfies Record<TInfoKind, string>;
