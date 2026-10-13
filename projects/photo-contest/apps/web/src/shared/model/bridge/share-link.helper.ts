import { BRIDGE_ERROR_CODE } from '@photo-contest/bridge';
import { BridgeError } from '@photo-contest/bridge/web';
import type { IWebBridge } from '@photo-contest/bridge/web';

export const SHARE_OUTCOME = {
  /** 공유 시트로 보냈다 */
  Shared: 'shared',
  /** 공유할 수 없어 클립보드에 복사했다 */
  Copied: 'copied',
  /** 사용자가 공유 시트를 닫았다 */
  Cancelled: 'cancelled',
  /** 공유도 복사도 하지 못했다 */
  Failed: 'failed',
} as const;
export type TShareOutcome = (typeof SHARE_OUTCOME)[keyof typeof SHARE_OUTCOME];

export interface IShareContent {
  title?: string;
  text?: string;
}

/** 공유·복사에 쓰는 브라우저 기능. 테스트에서 바꿔 끼울 수 있게 밖에서 받는다. */
export interface IShareEnvironment {
  bridge: IWebBridge | null;
  navigator?: Partial<Pick<Navigator, 'share' | 'canShare' | 'clipboard'>>;
  document?: Document;
}

const isCancellation = (error: unknown) =>
  (error instanceof BridgeError && error.code === BRIDGE_ERROR_CODE.Cancelled) ||
  (error instanceof DOMException && error.name === 'AbortError');

/** 클립보드 API를 못 쓰는 WebView·http 환경용. 화면 밖 textarea를 선택해 복사하고 포커스를 되돌린다. */
function copyWithTextarea(text: string, doc: Document) {
  if (typeof doc.execCommand !== 'function') return false;
  const active = doc.activeElement;
  const textarea = doc.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  // iOS가 확대하거나 화면을 움직이지 않도록 16px, 고정 위치로 화면 밖에 둔다.
  textarea.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;font-size:16px;';
  doc.body.append(textarea);
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  let copied = false;
  try {
    copied = doc.execCommand('copy');
  } catch {
    copied = false;
  }
  textarea.remove();
  if (active instanceof HTMLElement) active.focus();
  return copied;
}

/** 앱 clipboard.copy → navigator.clipboard → 숨긴 textarea 순서로 복사한다. 하나라도 성공하면 true. */
export async function copyText(text: string, { bridge, navigator: nav, document: doc }: IShareEnvironment) {
  if (bridge?.supports('clipboard.copy')) {
    try {
      await bridge.request('clipboard.copy', { text });
      return true;
    } catch {
      // 앱이 복사하지 못하면 웹 방식으로 이어서 시도한다.
    }
  }
  if (typeof nav?.clipboard?.writeText === 'function') {
    try {
      await nav.clipboard.writeText(text);
      return true;
    } catch {
      // 권한이 없거나 보안 컨텍스트가 아니면 거절된다.
    }
  }
  return doc ? copyWithTextarea(text, doc) : false;
}

/**
 * 앱 share.open → navigator.share → 복사 순서로 링크를 공유한다.
 * 사용자가 공유 시트를 닫으면 다음 방법으로 넘어가지 않고 cancelled를 돌려준다.
 */
export async function shareLink(
  url: string,
  content: IShareContent,
  env: IShareEnvironment,
): Promise<TShareOutcome> {
  if (env.bridge?.supports('share.open')) {
    try {
      const { shared } = await env.bridge.request('share.open', { url, ...content });
      return shared ? SHARE_OUTCOME.Shared : SHARE_OUTCOME.Cancelled;
    } catch (error) {
      if (isCancellation(error)) return SHARE_OUTCOME.Cancelled;
    }
  }
  const data: ShareData = { url, ...content };
  const share = env.navigator?.share;
  if (typeof share === 'function' && (env.navigator?.canShare?.(data) ?? true)) {
    try {
      await share.call(env.navigator, data);
      return SHARE_OUTCOME.Shared;
    } catch (error) {
      if (isCancellation(error)) return SHARE_OUTCOME.Cancelled;
    }
  }
  const copied = await copyText([content.text, url].filter(Boolean).join('\n'), env);
  return copied ? SHARE_OUTCOME.Copied : SHARE_OUTCOME.Failed;
}

/** 외부 문서(정책 문서 등)를 연다. 앱이면 시스템 브라우저로, 아니면 새 탭으로 연다. */
export async function openExternalLink(
  url: string,
  { bridge, open }: { bridge: IWebBridge | null; open: Window['open'] },
) {
  if (bridge?.supports('link.open')) {
    try {
      await bridge.request('link.open', { url });
      return;
    } catch {
      // 앱이 열지 못하면 웹 방식으로 연다.
    }
  }
  open(url, '_blank', 'noopener,noreferrer');
}
