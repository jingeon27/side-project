import { getOpenOverlayKeys, waitForOverlayEntriesAfter } from './overlay-history.store';

/** 떠나도 되면 true. 대화상자로 묻는다면 그 대화상자가 닫힌 뒤에 끝낸다. */
type TConfirmLeave = () => Promise<boolean>;

let registered: { pathname: string; confirmLeave: TConfirmLeave } | null = null;

/**
 * 화면을 떠나기 전에 물을 확인을 등록한다. 초안이 있는 화면이 등록하고 앱바·앱(안드로이드) 뒤로 가기가 이동 전에 부른다.
 * 브라우저 뒤로 가기와 iOS 스와이프는 막지 않는다(Activity가 최근 화면의 입력을 보존한다). 돌려준 함수로 해제한다.
 */
export function registerLeaveGuard(pathname: string, confirmLeave: TConfirmLeave) {
  const entry = { pathname, confirmLeave };
  registered = entry;
  return () => {
    if (registered === entry) registered = null;
  };
}

const confirmThenLeave = async (confirmLeave: TConfirmLeave, leave: () => void) => {
  const openBefore = getOpenOverlayKeys();
  if (!(await confirmLeave())) return;
  await waitForOverlayEntriesAfter(openBefore);
  leave();
};

/**
 * pathname 화면에 등록한 확인이 있으면 묻고, 떠나도 될 때만 leave를 부른다. 확인이 없으면 바로 부른다.
 * 묻는 대화상자가 쌓은 history 항목을 걷어 낸 뒤에 부르므로 leave의 뒤로 가기가 그 항목만 지우고 멈추지 않는다.
 */
export function leaveAfterConfirm(pathname: string, leave: () => void) {
  if (registered?.pathname !== pathname) {
    leave();
    return;
  }
  void confirmThenLeave(registered.confirmLeave, leave);
}
