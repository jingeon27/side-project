export type TBridgeAppState = 'active' | 'background';

/**
 * AppState 변화 중 웹에 알릴 것만 고른다. iOS의 inactive(알림 센터, 인증 확인 창)는 무시하고,
 * 실제로 background에 다녀온 뒤에만 active를 알려 웹이 불필요하게 다시 불러오지 않게 한다.
 */
export function nextBridgeAppState(previous: TBridgeAppState, next: string): TBridgeAppState | null {
  if (next === 'background' && previous === 'active') return 'background';
  if (next === 'active' && previous === 'background') return 'active';
  return null;
}
