'use client';

import { use, type ReactNode } from 'react';

interface IAwaitProps<T> {
  value: T | Promise<T>;
  children: (value: T) => ReactNode;
}

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function';
}

function PromiseValue<T>({ value, children }: { value: Promise<T>; children: (value: T) => ReactNode }) {
  return children(use(value));
}

/** Keep promise reads on their own fiber when a streamed snapshot becomes a synchronous snapshot. */
export function Await<T>({ value, children }: IAwaitProps<T>) {
  return isPromise(value) ? <PromiseValue value={value}>{children}</PromiseValue> : children(value);
}
