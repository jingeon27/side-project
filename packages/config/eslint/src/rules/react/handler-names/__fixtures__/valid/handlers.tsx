import { useEffectEvent as event } from 'react';

function Search() {
  const handleShortcut = event((event: KeyboardEvent) => event.preventDefault());
  const handleClick: () => void = () => submit();
  document.addEventListener('keydown', handleShortcut);
  document.removeEventListener('keydown', handleShortcut);
  return <button onClick={handleClick}>검색</button>;
}
