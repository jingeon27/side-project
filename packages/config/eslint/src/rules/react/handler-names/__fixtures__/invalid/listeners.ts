import { useEffectEvent as event } from 'react';

function useSearch() {
  const shortcut = event((event: KeyboardEvent) => event.preventDefault());
  const visible = useCallback(() => refresh(), []);
  document.addEventListener('keydown', shortcut);
  document.removeEventListener('keydown', shortcut);
  new IntersectionObserver(visible);
}
