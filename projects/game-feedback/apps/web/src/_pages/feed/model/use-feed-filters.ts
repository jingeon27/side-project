import { useBrowserSearch } from '@/shared/navigation';

export function useFeedFilters() {
  const params = new URLSearchParams(useBrowserSearch());
  const tab = params.get('tab') === 'unanswered' ? 'unanswered' : 'latest';

  function handleTabChange(nextTab: string) {
    const next = new URLSearchParams(window.location.search);
    next.delete('tab');
    if (nextTab === 'unanswered') next.set('tab', nextTab);
    const query = next.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    );
  }

  return { tab, handleTabChange };
}
