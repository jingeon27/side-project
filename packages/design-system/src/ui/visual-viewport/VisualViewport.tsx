'use client';

import { useEffect } from 'react';

export function VisualViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    const previousHeight = root.style.getPropertyValue('--visual-viewport-height');
    const previousTop = root.style.getPropertyValue('--visual-viewport-top');
    const handleResize = () => {
      root.style.setProperty('--visual-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
      root.style.setProperty('--visual-viewport-top', `${viewport?.offsetTop ?? 0}px`);
    };
    handleResize();
    viewport?.addEventListener('resize', handleResize);
    viewport?.addEventListener('scroll', handleResize);
    window.addEventListener('resize', handleResize);
    return () => {
      viewport?.removeEventListener('resize', handleResize);
      viewport?.removeEventListener('scroll', handleResize);
      window.removeEventListener('resize', handleResize);
      root.style.setProperty('--visual-viewport-height', previousHeight);
      root.style.setProperty('--visual-viewport-top', previousTop);
    };
  }, []);
  return null;
}
