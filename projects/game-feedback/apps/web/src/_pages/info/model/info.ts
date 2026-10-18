export type TInfoKind = 'guide' | 'terms' | 'privacy' | 'contact';
export const infoTitles = {
  guide: '좋은 피드백은 함께 만들어요',
  terms: '이용약관 (비공개 알파 초안)',
  privacy: '개인정보 처리 안내 (비공개 알파 초안)',
  contact: '플레이메이트에 이야기해주세요',
} satisfies Record<TInfoKind, string>;
