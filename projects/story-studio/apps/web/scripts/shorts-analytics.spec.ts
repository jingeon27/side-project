import { afterEach, describe, expect, it, vi } from 'vitest';

import { trackShortsInvocation } from './shorts-analytics';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('shorts command analytics', () => {
  it('skips transmission without a CLI key or with an unrecognized command', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubEnv('STORY_STUDIO_SHORTS_AMPLITUDE_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_STORY_STUDIO_AMPLITUDE_KEY', 'web-only');
    await expect(trackShortsInvocation('status', async () => 0)).resolves.toBe(0);
    vi.stubEnv('STORY_STUDIO_SHORTS_AMPLITUDE_KEY', 'cli-test');
    await expect(trackShortsInvocation('--help', async () => 0)).resolves.toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('records a started and successful command without arguments, a user ID or an IP field', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response());
    vi.stubGlobal('fetch', fetch);
    vi.stubEnv('STORY_STUDIO_SHORTS_AMPLITUDE_KEY', 'cli-test');

    await expect(trackShortsInvocation('render', async () => 0)).resolves.toBe(0);

    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    const event = {
      event_properties: { action: 'shorts-render' },
      device_id: expect.any(String),
      insert_id: expect.any(String),
      time: expect.any(Number),
    };
    expect(body).toEqual({
      api_key: 'cli-test',
      events: [
        { ...event, event_type: 'studio_request_clicked' },
        { ...event, event_type: 'studio_request_succeeded' },
      ],
    });
    expect(body.events[0].device_id).toBe(body.events[1].device_id);
  });

  it('preserves a failed command result even if transmission also fails', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetch);
    vi.stubEnv('STORY_STUDIO_SHORTS_AMPLITUDE_KEY', 'cli-test');

    await expect(trackShortsInvocation('daily', async () => 1)).resolves.toBe(1);
    await expect(
      trackShortsInvocation('daily', async () => {
        throw new Error('failed render');
      }),
    ).rejects.toThrow('failed render');

    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [, options] of fetch.mock.calls) {
      const body = JSON.parse(String(options?.body));
      expect(body.events).toHaveLength(1);
      expect(body.events[0].event_type).toBe('studio_request_clicked');
    }
  });
});
