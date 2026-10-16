'use client';
import { useEffect } from 'react';

export function MobileViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    function handleResize() {
      root.style.setProperty('--visual-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
      root.style.setProperty('--visual-viewport-top', `${viewport?.offsetTop ?? 0}px`);
    }
    handleResize();
    viewport?.addEventListener('resize', handleResize);
    viewport?.addEventListener('scroll', handleResize);
    window.addEventListener('resize', handleResize);
    return () => {
      viewport?.removeEventListener('resize', handleResize);
      viewport?.removeEventListener('scroll', handleResize);
      window.removeEventListener('resize', handleResize);
      root.style.removeProperty('--visual-viewport-height');
      root.style.removeProperty('--visual-viewport-top');
    };
  }, []);
  return null;
}
