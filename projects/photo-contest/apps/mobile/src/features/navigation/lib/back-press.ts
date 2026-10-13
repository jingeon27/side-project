export type TBackPressAction = 'none' | 'go-back' | 'exit';

interface IBackPressState {
  webHandled: boolean;
  canGoBack: boolean;
}

/** 화면 기록은 웹이 가진다. 웹이 처리하지 않았을 때만 WebView 기록, 그것도 없으면 앱을 닫는다. */
export function decideBackPress({ webHandled, canGoBack }: IBackPressState): TBackPressAction {
  if (webHandled) return 'none';
  return canGoBack ? 'go-back' : 'exit';
}

/** 웹에 먼저 묻는다. 시간 초과·오류(웹이 아직 준비되지 않음 등)는 처리하지 않은 것으로 본다. */
export async function resolveBackPress(
  askWeb: () => Promise<{ handled: boolean }>,
  canGoBack: () => boolean,
): Promise<TBackPressAction> {
  let webHandled = false;
  try {
    webHandled = (await askWeb()).handled;
  } catch {
    webHandled = false;
  }
  // 웹 응답을 기다리는 동안 기록이 바뀌었을 수 있어 응답 뒤에 읽는다.
  return decideBackPress({ webHandled, canGoBack: canGoBack() });
}
