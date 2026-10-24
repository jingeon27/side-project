import { useSyncExternalStore } from 'react';
import { useColorScheme } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { COLORS, DARK_COLORS } from '../config/theme';

type TAppearance = 'system' | 'light' | 'dark';
const KEY = 'photo-contest:appearance';
let preference: TAppearance = 'system';
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function setAppearance(value: TAppearance) {
  preference = value;
  listeners.forEach((listener) => listener());
  void AsyncStorage.setItem(KEY, value).catch(() => undefined);
}

export async function restoreAppearance() {
  const stored = await AsyncStorage.getItem(KEY).catch(() => null);
  if (stored === 'light' || stored === 'dark' || stored === 'system') setAppearance(stored);
}

export function useAppearance() {
  const selected = useSyncExternalStore(
    subscribe,
    () => preference,
    () => 'system' as const,
  );
  const system = useColorScheme();
  const dark = selected === 'dark' || (selected === 'system' && system === 'dark');
  return { colors: dark ? DARK_COLORS : COLORS, dark };
}
