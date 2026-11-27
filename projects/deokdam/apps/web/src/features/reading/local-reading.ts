'use client';

import { seoulToday } from '@/shared/seoul-time';

import { elementSchema, readingSchema, type TReading, type TReadingInput } from './contracts';

function readingKey(input: TReadingInput) {
  return ['deokdam.reading.v2', input.topic, input.concern, input.element, input.experience]
    .filter(Boolean)
    .join('.');
}

export function readCachedReading(input: TReadingInput) {
  try {
    const raw = localStorage.getItem(readingKey(input));
    if (!raw) return undefined;
    const data = JSON.parse(raw);
    if (data.day !== seoulToday()) return undefined;
    const result = readingSchema.safeParse(data);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

export function rememberReading(input: TReadingInput, reading: TReading) {
  try {
    localStorage.setItem(readingKey(input), JSON.stringify({ day: seoulToday(), ...reading }));
    sessionStorage.setItem('deokdam.last-reading.' + input.topic, input.element);
  } catch {
    // Reading and journaling remain usable when optional cache writes fail.
  }
}

export function reportFocus(topic: 'job' | 'parent') {
  try {
    const result = elementSchema.safeParse(sessionStorage.getItem('deokdam.last-reading.' + topic));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}
