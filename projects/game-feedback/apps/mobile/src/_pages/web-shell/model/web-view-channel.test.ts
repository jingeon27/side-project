import { describe, expect, it } from 'vitest';

import { WebViewChannel } from './web-view-channel';

const origin = 'https://feedback.example';

describe('WebViewChannel document reload', () => {
  it('recreates the WebView when the same document is requested again after an offline failure', () => {
    const channel = new WebViewChannel(`${origin}/`);
    channel.rememberUrl(`${origin}/ko/posts/abc`);
    channel.loadCurrentDocument();
    expect(channel.getSnapshot()).toMatchObject({ sourceUrl: `${origin}/ko/posts/abc`, webViewKey: 0 });
    channel.rememberHistory(true);

    channel.fail();
    channel.loadCurrentDocument();

    expect(channel.getSnapshot()).toEqual({
      sourceUrl: `${origin}/ko/posts/abc`,
      webViewKey: 1,
      loading: true,
      offline: false,
      overlayOpen: false,
    });
    expect(channel.canGoBack()).toBe(false);
  });

  it('recreates a loaded document that never became ready but keeps a load already in progress', () => {
    const channel = new WebViewChannel(`${origin}/ko`);
    const loading = channel.getSnapshot();
    channel.loadCurrentDocument();
    expect(channel.getSnapshot()).toBe(loading);

    channel.finishLoading();
    channel.loadCurrentDocument();
    expect(channel.getSnapshot()).toMatchObject({ sourceUrl: `${origin}/ko`, webViewKey: 1, loading: true });
  });

  it('opens a different document after a failure in a new WebView', () => {
    const channel = new WebViewChannel(`${origin}/`);
    channel.fail();
    channel.rememberUrl(`${origin}/ko/settings`);
    channel.loadCurrentDocument();
    expect(channel.getSnapshot()).toMatchObject({
      sourceUrl: `${origin}/ko/settings`,
      webViewKey: 1,
      loading: true,
      offline: false,
    });
  });
});
