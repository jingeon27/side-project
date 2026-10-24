// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NativeCapabilityError, type TNativeCapabilities } from '@photo-contest/bridge/native';
import { installFakeNativeApp, type IFakeNativeApp } from '@photo-contest/bridge/test';
import { createWebBridge, type IWebBridge } from '@photo-contest/bridge/web';

import {
  COPY_METHOD,
  copyText,
  openExternalLink,
  SHARE_OUTCOME,
  shareLink,
  type IShareEnvironment,
} from './share-link.helper';

const URL_TO_SHARE = 'http://localhost:3000/invite/abc';

let fake: IFakeNativeApp | undefined;
let bridge: IWebBridge | undefined;

function inApp(capabilities: TNativeCapabilities) {
  fake = installFakeNativeApp(window, { capabilities });
  bridge = createWebBridge(window);
  return { fake, bridge };
}

function stubExecCommand(result: boolean) {
  const execCommand = vi.fn(() => result);
  Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
  return execCommand;
}

afterEach(() => {
  bridge?.dispose();
  fake?.uninstall();
  bridge = undefined;
  fake = undefined;
  Reflect.deleteProperty(document, 'execCommand');
});

describe('shareLink', () => {
  it('앱이 공유를 지원하면 앱 공유 시트를 쓰고 웹 공유는 부르지 않아야 한다', async () => {
    const app = inApp({ 'share.open': async () => ({ shared: true }) });
    const share = vi.fn();
    await expect(
      shareLink(URL_TO_SHARE, { title: '초대' }, { bridge: app.bridge, navigator: { share } }),
    ).resolves.toBe(SHARE_OUTCOME.SharedInApp);
    expect(app.fake.calls).toEqual([{ type: 'share.open', payload: { url: URL_TO_SHARE, title: '초대' } }]);
    expect(share).not.toHaveBeenCalled();
  });

  it('앱 공유 시트를 닫으면 다른 방법으로 넘어가지 않고 cancelled여야 한다', async () => {
    const app = inApp({
      'share.open': async () => {
        throw new NativeCapabilityError('CANCELLED', '취소했습니다.');
      },
    });
    const share = vi.fn();
    await expect(shareLink(URL_TO_SHARE, {}, { bridge: app.bridge, navigator: { share } })).resolves.toBe(
      SHARE_OUTCOME.Cancelled,
    );
    expect(share).not.toHaveBeenCalled();
  });

  it('앱이 공유를 지원하지 않으면(이전 버전) Web Share API를 써야 한다', async () => {
    const app = inApp({ 'clipboard.copy': async () => ({ copied: true }) });
    const share = vi.fn(async () => undefined);
    await expect(
      shareLink(URL_TO_SHARE, { text: '같이 해요' }, { bridge: app.bridge, navigator: { share } }),
    ).resolves.toBe(SHARE_OUTCOME.SharedOnWeb);
    expect(share).toHaveBeenCalledWith({ url: URL_TO_SHARE, text: '같이 해요' });
    expect(app.fake.calls).toEqual([]);
  });

  it('Web Share 시트를 닫으면(AbortError) cancelled여야 한다', async () => {
    const share = vi.fn(async () => {
      throw new DOMException('Share canceled', 'AbortError');
    });
    const writeText = vi.fn();
    await expect(
      shareLink(URL_TO_SHARE, {}, { bridge: null, navigator: { share, clipboard: { writeText } as never } }),
    ).resolves.toBe(SHARE_OUTCOME.Cancelled);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('공유할 방법이 없으면 안내 문구와 링크를 복사해야 한다', async () => {
    const writeText = vi.fn(async () => undefined);
    const environment: IShareEnvironment = { bridge: null, navigator: { clipboard: { writeText } as never } };
    await expect(shareLink(URL_TO_SHARE, { text: '우승작 보기' }, environment)).resolves.toBe(
      SHARE_OUTCOME.Copied,
    );
    expect(writeText).toHaveBeenCalledWith(`우승작 보기\n${URL_TO_SHARE}`);
  });

  it('공유도 복사도 못 하면 failed여야 한다', async () => {
    await expect(shareLink(URL_TO_SHARE, {}, { bridge: null, navigator: {}, document })).resolves.toBe(
      SHARE_OUTCOME.Failed,
    );
  });
});

describe('copyText', () => {
  it('앱 → navigator.clipboard → 숨긴 textarea 순서로 시도해야 한다', async () => {
    const app = inApp({
      'clipboard.copy': async () => {
        throw new NativeCapabilityError('FAILED', '복사하지 못했습니다.');
      },
    });
    const writeText = vi.fn(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    });
    const execCommand = stubExecCommand(true);
    const button = document.body.appendChild(document.createElement('button'));
    button.focus();

    await expect(
      copyText('링크', { bridge: app.bridge, navigator: { clipboard: { writeText } as never }, document }),
    ).resolves.toBe(COPY_METHOD.Web);
    expect(app.fake.calls).toEqual([{ type: 'clipboard.copy', payload: { text: '링크' } }]);
    expect(writeText).toHaveBeenCalledWith('링크');
    expect(execCommand).toHaveBeenCalledWith('copy');
    // 복사용 textarea를 치우고 포커스를 원래 버튼으로 돌려놓는다.
    expect(document.querySelector('textarea')).toBeNull();
    expect(document.activeElement).toBe(button);
    button.remove();
  });

  it('앱이 복사하면 웹 클립보드는 건드리지 않아야 한다', async () => {
    const app = inApp({ 'clipboard.copy': async () => ({ copied: true }) });
    const writeText = vi.fn();
    await expect(
      copyText('링크', { bridge: app.bridge, navigator: { clipboard: { writeText } as never } }),
    ).resolves.toBe(COPY_METHOD.App);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('모든 방법이 실패하면 null이어야 한다', async () => {
    stubExecCommand(false);
    await expect(copyText('링크', { bridge: null, navigator: {}, document })).resolves.toBeNull();
  });
});

describe('openExternalLink', () => {
  it('앱이면 시스템 브라우저로, 아니면 새 탭으로 열어야 한다', async () => {
    const app = inApp({ 'link.open': async () => ({ opened: true }) });
    const open = vi.fn<Window['open']>(() => null);
    await openExternalLink('https://policy.example/terms', { bridge: app.bridge, open });
    expect(app.fake.calls).toEqual([{ type: 'link.open', payload: { url: 'https://policy.example/terms' } }]);
    expect(open).not.toHaveBeenCalled();

    await openExternalLink('https://policy.example/terms', { bridge: null, open });
    expect(open).toHaveBeenCalledWith('https://policy.example/terms', '_blank', 'noopener,noreferrer');
  });
});
