'use client';

import { createInstance } from '@amplitude/analytics-browser';

import type { IEventProperties } from './events';

const apiKey = process.env.NEXT_PUBLIC_DEOKDAM_AMPLITUDE_KEY?.trim();
const analytics = typeof window === 'undefined' || !apiKey ? null : createInstance();
const deviceKey = 'deokdam.analytics-device';

export function analyticsDeviceId() {
  if (!analytics) return undefined;
  try {
    const existing = localStorage.getItem(deviceKey);
    if (existing) return existing;
    const deviceId = crypto.randomUUID();
    localStorage.setItem(deviceKey, deviceId);
    return deviceId;
  } catch {
    return undefined;
  }
}

if (analytics && apiKey) {
  const deviceId = analyticsDeviceId();
  analytics.init(apiKey, {
    deviceId,
    identityStorage: 'none',
    autocapture: false,
    trackingOptions: { ipAddress: false, language: false },
  });
}

export function track<T extends keyof IEventProperties>(name: T, properties: IEventProperties[T]) {
  analytics?.track(name, properties);
}
