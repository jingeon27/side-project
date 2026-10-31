import dayjs from 'dayjs';

const OVERLAY_STATE_KEY = '__photoContestOverlay';

interface IOverlayEntry {
  key: string;
  onBack: () => void;
}

const stack: IOverlayEntry[] = [];
let navigatingFromOverlay = false;
let listening = false;
let sequence = 0;

const readKey = (state: unknown) => {
  if (typeof state !== 'object' || state === null) return null;
  const value: unknown = Reflect.get(state, OVERLAY_STATE_KEY);
  return typeof value === 'string' ? value : null;
};

const handlePopState = () => {
  const currentKey = readKey(window.history.state);
  const keepCount = currentKey ? stack.findIndex((entry) => entry.key === currentKey) + 1 : 0;
  if (currentKey && keepCount === 0) {
    // 닫힌 오버레이가 남긴 항목에 도착했다. 같은 화면을 한 번 더 보여 주지 않도록 건너뛴다.
    window.history.back();
    return;
  }
  const popped = stack.splice(keepCount);
  popped.reverse().forEach((entry) => entry.onBack());
};

/**
 * 바텀시트·다이얼로그를 열 때 history 항목을 하나 쌓아 브라우저·안드로이드 뒤로 가기가 오버레이를 먼저 닫게 한다.
 * 돌려준 key는 닫을 때 releaseOverlayEntry에 넘긴다.
 */
export function pushOverlayEntry(onBack: () => void) {
  if (!listening) {
    window.addEventListener('popstate', handlePopState);
    listening = true;
  }
  sequence += 1;
  const key = `${dayjs().valueOf().toString(36)}-${sequence}`;
  // Next는 pushState를 감싸 자기 라우터 상태를 이 항목에 복사한다. URL은 그대로 둔다.
  window.history.pushState({ [OVERLAY_STATE_KEY]: key }, '');
  stack.push({ key, onBack });
  return key;
}

/** 오버레이가 뒤로 가기 말고 다른 방법(닫기 버튼, 스와이프, 완료)으로 닫혔을 때 쌓았던 항목을 걷어 낸다. */
export function releaseOverlayEntry(key: string) {
  const index = stack.findIndex((entry) => entry.key === key);
  if (index < 0) return;
  stack.splice(index, 1);
  if (readKey(window.history.state) !== key) return;
  if (navigatingFromOverlay) {
    // 오버레이에서 다른 화면으로 가는 중이다. 여기서 back()하면 Next가 진행 중인 이동을 버린다.
    navigatingFromOverlay = false;
    return;
  }
  window.history.back();
}

export function hasOpenOverlay() {
  return stack.length > 0;
}

/** 맨 위 오버레이를 뒤로 가기와 같은 경로로 닫는다. 닫을 것이 없으면 false. */
export function closeTopOverlay() {
  if (stack.length === 0) return false;
  window.history.back();
  return true;
}

/** 지금 history 항목이 열린 오버레이의 것인지. 이때 화면 이동은 이 항목을 replace해야 기록이 꼬이지 않는다. */
export function isOverlayEntryCurrent() {
  const key = readKey(window.history.state);
  return key !== null && stack.some((entry) => entry.key === key);
}

/** 오버레이 항목 위에서 화면을 이동한다고 알린다. 이어서 닫히는 오버레이가 back()하지 않는다. */
export function markOverlayNavigation() {
  navigatingFromOverlay = true;
}

/** 경로가 바뀌면 부른다. 남은 표시를 지운다. */
export function resetOverlayNavigation() {
  navigatingFromOverlay = false;
}

/** 다른 코드가 replaceState할 때 열린 오버레이의 표시를 잃지 않게 지금 항목의 표시만 꺼낸다. */
export function pickOverlayState(state: unknown) {
  const key = readKey(state);
  return key ? { [OVERLAY_STATE_KEY]: key } : null;
}
