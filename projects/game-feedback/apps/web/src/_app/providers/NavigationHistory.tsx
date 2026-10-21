'use client';

import { useEffect } from 'react';

import { installBrowserNavigation } from '@/shared/navigation';

export function NavigationHistory() {
  useEffect(installBrowserNavigation, []);
  return null;
}
