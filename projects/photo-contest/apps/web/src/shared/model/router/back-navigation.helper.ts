import { ROUTES } from '../../constants/routes';

export type TBackAction =
  { type: 'close-overlay' } | { type: 'history-back' } | { type: 'replace'; href: string } | { type: 'exit' };

/**
 * 앱(안드로이드) 뒤로 가기 처리 순서: 열린 오버레이 → 앱 안 기록 → 상위 화면 → 홈이면 앱에 맡김(exit).
 */
export function resolveBackAction({
  hasOverlay,
  depth,
  pathname,
  parentHref,
}: {
  hasOverlay: boolean;
  depth: number;
  pathname: string;
  parentHref: string | null;
}): TBackAction {
  if (hasOverlay) return { type: 'close-overlay' };
  if (depth > 0) return { type: 'history-back' };
  if (pathname !== ROUTES.HOME) return { type: 'replace', href: parentHref ?? ROUTES.HOME };
  return { type: 'exit' };
}
