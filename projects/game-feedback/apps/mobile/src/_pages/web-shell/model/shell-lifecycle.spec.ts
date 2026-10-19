import { describe, expect, it, vi } from 'vitest';
import { ShellLifecycle } from './shell-lifecycle';

function setup() {
  const options = {
    openLink: vi.fn(),
    onState: vi.fn(),
    onBack: vi.fn(async () => false),
    onFallbackBack: vi.fn(),
  };
  return { lifecycle: new ShellLifecycle(options), ...options };
}

describe('ShellLifecycle', () => {
  it('keeps a newer warm link ahead of a delayed initial link and ignores work after disposal', () => {
    const context = setup();
    context.lifecycle.openLink({ url: 'gamefeedback://ja/settings' });
    context.lifecycle.openInitialLink('gamefeedback://ko/posts/older');
    expect(context.openLink).toHaveBeenCalledExactlyOnceWith('gamefeedback://ja/settings');
    context.lifecycle.dispose();
    context.lifecycle.openLink({ url: 'gamefeedback://en' });
    context.lifecycle.openInitialLink('gamefeedback://en');
    context.lifecycle.changeState('background');
    context.lifecycle.back();
    expect(context.openLink).toHaveBeenCalledOnce();
    expect(context.onState).not.toHaveBeenCalled();
    expect(context.onBack).not.toHaveBeenCalled();
  });

  it('emits foreground once after background and ignores transient inactive transitions', () => {
    const context = setup();
    context.lifecycle.changeState('inactive');
    context.lifecycle.changeState('active');
    expect(context.onState).not.toHaveBeenCalled();
    context.lifecycle.changeState('background');
    context.lifecycle.changeState('background');
    context.lifecycle.changeState('inactive');
    context.lifecycle.changeState('active');
    context.lifecycle.changeState('active');
    expect(context.onState.mock.calls).toEqual([['background'], ['active']]);
  });

  it('suppresses duplicate back presses and cancels fallback when the shell unmounts', async () => {
    const context = setup();
    context.lifecycle.back();
    context.lifecycle.back();
    expect(context.onBack).toHaveBeenCalledOnce();
    context.lifecycle.dispose();
    await Promise.resolve();
    expect(context.onFallbackBack).not.toHaveBeenCalled();
  });

  it('recovers a rejected web back request and accepts a later handled request', async () => {
    const context = setup();
    context.onBack.mockRejectedValueOnce(new Error('bridge unavailable')).mockResolvedValueOnce(true);
    context.lifecycle.back();
    await vi.waitFor(() => expect(context.onFallbackBack).toHaveBeenCalledOnce());
    context.lifecycle.back();
    await vi.waitFor(() => expect(context.onBack).toHaveBeenCalledTimes(2));
    expect(context.onFallbackBack).toHaveBeenCalledOnce();
    context.lifecycle.dispose();
  });
});
